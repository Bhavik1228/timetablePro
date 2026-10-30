import assert from "node:assert/strict";
import test from "node:test";
import {
  addClass,
  addRoom,
  addSubject,
  addTeacher,
  createEmptySchoolData,
  getEffectiveSubjectRequirements,
  getSchoolData,
  replaceSchoolData,
  saveSubjectAssignment,
  saveTransitionRule,
  updateClass,
  updateSchoolSettings,
} from "../src/services/schoolDataService.ts";
import { generateSchoolTimetables } from "../src/services/schoolScheduler.ts";
import { buildDailyTimeline } from "../src/services/schoolPlanningService.ts";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  clear() {
    this.#values.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

function resetData() {
  storage.clear();
  replaceSchoolData(createEmptySchoolData());
}

function addTestSubject(name, code = name.slice(0, 3).toUpperCase()) {
  return addSubject({
    name,
    code,
    category: "core",
    description: "",
    defaultLessonDurationMinutes: 40,
    requiresDoublePeriods: false,
    active: true,
  });
}

function addTestClass(
  name,
  selectedSubjectIds,
  section = "A",
  schoolDays = ["Monday", "Tuesday"],
) {
  return addClass({
    name,
    levelId: "level-1",
    section,
    academicYear: "2026-2027",
    estimatedStudentCount: 24,
    schoolDays,
    selectedSubjectIds,
    active: true,
    notes: "",
  });
}

function addTestTeacher(name, code, qualifiedSubjectIds, limits = {}) {
  return addTeacher({
    name,
    email: "",
    employeeCode: code,
    qualifiedSubjectIds,
    preferredLevelIds: [],
    eligibleClassIds: [],
    availability: [],
    maxWeeklyPeriods: limits.weekly ?? 8,
    maxDailyPeriods: limits.daily ?? 4,
    unavailableDayPeriods: [],
    active: true,
    notes: "",
  });
}

function addTestAssignment(classId, subjectId, options = {}) {
  return saveSubjectAssignment({
    subjectId,
    classId,
    weeklyFrequency: options.frequency ?? 1,
    periodsPerLesson: options.periodsPerLesson ?? 1,
    eligibleTeacherIds: options.eligibleTeacherIds ?? [],
    preferredTeacherId: options.preferredTeacherId ?? null,
    roomRequirements: options.roomRequirements ?? [],
    isRequired: true,
    active: true,
    notes: "",
  });
}

test("teacher employee codes are unique regardless of case", () => {
  resetData();
  const math = addTestSubject("Mathematics");
  addTestTeacher("Alex Teacher", "T-100", [math.id]);

  assert.throws(
    () => addTestTeacher("Another Teacher", "t-100", [math.id]),
    /employee code is already in use/i,
  );
});

test("classes reject duplicate name, section, and academic-year tuples", () => {
  resetData();
  const math = addTestSubject("Mathematics");
  addTestClass("Year 7", [math.id], "A");

  assert.throws(
    () => addTestClass("year 7", [math.id], "a"),
    /already exists/i,
  );
  const secondClass = addTestClass("Year 7", [math.id], "B");
  assert.throws(
    () => updateClass(secondClass.id, { section: "A" }),
    /already exists/i,
  );
});

test("subject assignments preserve per-class weekly frequency and block size", () => {
  resetData();
  const math = addTestSubject("Mathematics");
  const firstClass = addTestClass("Year 7", [math.id], "A");
  const secondClass = addTestClass("Year 7", [math.id], "B");

  const first = addTestAssignment(firstClass.id, math.id, {
    frequency: 4,
    periodsPerLesson: 2,
  });
  const second = addTestAssignment(secondClass.id, math.id, {
    frequency: 2,
  });

  assert.equal(first.weeklyFrequency, 4);
  assert.equal(first.periodsPerLesson, 2);
  assert.equal(second.weeklyFrequency, 2);
});

test("legacy school data loads with an empty room inventory without data loss", () => {
  storage.clear();
  const legacy = createEmptySchoolData();
  delete legacy.rooms;
  legacy.settings.schoolName = "Existing School";
  storage.setItem("timetable-pro-school-data-v1", JSON.stringify(legacy));

  const restored = getSchoolData();
  assert.equal(restored.settings.schoolName, "Existing School");
  assert.deepEqual(restored.rooms, []);
});

test("default school settings have enough time for every configured period", () => {
  const settings = createEmptySchoolData().settings;

  for (const day of settings.schoolDays) {
    const timeline = buildDailyTimeline(day, settings);
    assert.equal(timeline.generatedPeriods, settings.periodsPerDay);
    assert.equal(
      timeline.issues.some((issue) => issue.severity === "error"),
      false,
    );
  }
});

test("transition rules support ALL and ANY and deduplicate matching targets", () => {
  resetData();
  const math = addTestSubject("Mathematics");
  const science = addTestSubject("Science");
  const lab = addTestSubject("Integrated Lab");
  const classRecord = addTestClass("Year 8", [math.id, science.id]);
  addTestAssignment(classRecord.id, math.id, { frequency: 3 });
  addTestAssignment(classRecord.id, science.id, { frequency: 2 });

  saveTransitionRule({
    name: "Either core subject activates lab",
    targetSubjectId: lab.id,
    requiredSubjectIds: [math.id, science.id],
    matchMode: "any",
    applicableClassIds: [],
    applicableLevelIds: [],
    weeklyFrequency: 2,
    enabled: true,
    notes: "",
  });
  saveTransitionRule({
    name: "Both core subjects activate lab",
    targetSubjectId: lab.id,
    requiredSubjectIds: [math.id, science.id],
    matchMode: "all",
    applicableClassIds: [],
    applicableLevelIds: [],
    weeklyFrequency: 4,
    enabled: true,
    notes: "",
  });

  const effective = getEffectiveSubjectRequirements(classRecord.id);
  const labRequirements = effective.filter((item) => item.subjectId === lab.id);

  assert.equal(labRequirements.length, 1);
  assert.equal(labRequirements[0].weeklyFrequency, 4);
  assert.equal(labRequirements[0].source, "transition");
  assert.equal(labRequirements[0].transitionRuleIds.length, 2);
});

test("multi-class generation protects teacher conflicts and school events", () => {
  resetData();
  const math = addTestSubject("Mathematics");
  const english = addTestSubject("English");
  const firstClass = addTestClass("Year 9", [math.id, english.id], "A");
  const secondClass = addTestClass("Year 9", [math.id, english.id], "B");
  addTestTeacher("Morgan Teacher", "T-200", [math.id, english.id]);
  addRoom({
    name: "Science Lab",
    type: "science lab",
    capacity: 30,
    active: true,
  });

  for (const classRecord of [firstClass, secondClass]) {
    addTestAssignment(classRecord.id, math.id, {
      roomRequirements: ["Science Lab"],
    });
    addTestAssignment(classRecord.id, english.id);
  }

  updateSchoolSettings({
    schoolDays: ["Monday", "Tuesday"],
    schoolStartTime: "08:00",
    schoolEndTime: "10:30",
    lessonDurationMinutes: 40,
    passingTimeMinutes: 5,
    periodsPerDay: 3,
    events: [{
      id: "break",
      name: "Morning break",
      type: "break",
      startTime: "08:40",
      endTime: "09:00",
      days: ["Monday", "Tuesday"],
      enabled: true,
      countsAsTeachingTime: false,
    }],
  });

  const timetables = generateSchoolTimetables();
  const settings = getSchoolData().settings;
  const sharedTeacherSlots = new Set();

  assert.equal(timetables.length, 2);
  assert.ok(timetables.every((timetable) => timetable.lessons.length === 2));

  for (const timetable of timetables) {
    for (const lesson of timetable.lessons) {
      assert.equal(lesson.teacher, "Morgan Teacher");
      const periodWindow = buildDailyTimeline(lesson.day, settings)
        .items.find((item) => item.type === "lesson" && item.period === lesson.period);

      assert.ok(
        periodWindow &&
          (periodWindow.endTime <= "08:40" ||
            periodWindow.startTime >= "09:00"),
        "lessons must not overlap the morning break",
      );

      const teacherSlot = `${lesson.day}:${lesson.period}`;
      assert.ok(!sharedTeacherSlots.has(teacherSlot));
      sharedTeacherSlots.add(teacherSlot);

      if (lesson.subject === "Mathematics") {
        assert.equal(lesson.room, "Science Lab");
      } else {
        assert.equal(lesson.room, "");
      }
    }
  }
});

test("room requirements reject rooms with incompatible types or capacity", () => {
  resetData();
  const chemistry = addTestSubject("Chemistry");
  const classRecord = addTestClass("Year 10", [chemistry.id]);
  addTestTeacher("Riley Teacher", "T-300", [chemistry.id]);
  addTestAssignment(classRecord.id, chemistry.id, {
    roomRequirements: ["laboratory"],
  });
  addRoom({
    name: "Small Lab",
    type: "laboratory",
    capacity: 12,
    active: true,
  });

  assert.throws(
    () => generateSchoolTimetables(),
    /No active.*room with enough capacity/i,
  );
});

test("double-period lessons cannot span a break and fit when periods are adjacent", () => {
  resetData();
  const science = addTestSubject("Science");
  const classRecord = addTestClass("Year 11", [science.id], "A", ["Monday"]);
  addTestTeacher("Casey Teacher", "T-400", [science.id]);
  addTestAssignment(classRecord.id, science.id, {
    periodsPerLesson: 2,
  });
  updateSchoolSettings({
    schoolDays: ["Monday"],
    schoolStartTime: "08:00",
    schoolEndTime: "10:00",
    periodsPerDay: 2,
    events: [],
  });

  assert.equal(generateSchoolTimetables()[0].lessons.length, 2);

  updateSchoolSettings({
    events: [{
      id: "break",
      name: "Morning break",
      type: "break",
      startTime: "08:40",
      endTime: "09:00",
      days: ["Monday"],
      enabled: true,
      countsAsTeachingTime: false,
    }],
  });

  assert.throws(
    () => generateSchoolTimetables(),
    /No timetable satisfies/i,
  );
});

test("generation rejects an unqualified or unavailable teacher", () => {
  resetData();
  const math = addTestSubject("Mathematics");
  const english = addTestSubject("English");
  const classRecord = addTestClass("Year 12", [english.id]);
  addTestTeacher("Taylor Teacher", "T-500", [math.id]);
  addTestAssignment(classRecord.id, english.id);

  assert.throws(
    () => generateSchoolTimetables(),
    /No active, qualified teacher/i,
  );

  resetData();
  const science = addTestSubject("Science");
  const unavailableClass = addTestClass("Year 12", [science.id], "A", ["Monday"]);
  updateSchoolSettings({
    schoolDays: ["Monday"],
    schoolStartTime: "08:00",
    schoolEndTime: "10:00",
    periodsPerDay: 2,
    events: [],
  });
  addTeacher({
    name: "Unavailable Teacher",
    email: "",
    employeeCode: "T-501",
    qualifiedSubjectIds: [science.id],
    preferredLevelIds: [],
    eligibleClassIds: [],
    availability: [{
      day: "Monday",
      startTime: "07:30",
      endTime: "15:00",
      available: false,
    }],
    maxWeeklyPeriods: 8,
    maxDailyPeriods: 4,
    unavailableDayPeriods: [],
    active: true,
    notes: "",
  });
  addTestAssignment(unavailableClass.id, science.id);

  assert.throws(
    () => generateSchoolTimetables(),
    /No timetable satisfies/i,
  );
});

test("invalid school-data imports do not overwrite existing records", () => {
  resetData();
  addTestClass("Year 7", ["missing-subject"]);

  assert.throws(
    () => replaceSchoolData({
      ...createEmptySchoolData(),
      classes: [{
        id: "invalid-class",
        name: "Year 7",
        levelId: "level-1",
        section: "A",
        academicYear: "2026-2027",
        estimatedStudentCount: 20,
        schoolDays: ["Monday"],
        selectedSubjectIds: ["missing-subject"],
        active: true,
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      }],
    }),
    /errors/i,
  );
  assert.equal(getSchoolData().classes.length, 1);
});
