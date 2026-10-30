import type {
  ClassRecord,
  DataValidationIssue,
  SchoolData,
  SchoolDay,
  SchoolSettings,
  RoomRecord,
  SubjectAssignment,
  SubjectRecord,
  TeacherRecord,
  TransitionSubjectRule,
  EffectiveSubjectRequirement,
} from "../types/school";

const STORAGE_KEY = "timetable-pro-school-data-v1";

const DEFAULT_DAYS: SchoolDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

function createId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function now(): number {
  return Date.now();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultSchoolSettings(): SchoolSettings {
  return {
    schoolName: "",
    schoolCode: "",
    academicYear: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    schoolDays: [...DEFAULT_DAYS],
    schoolStartTime: "07:30",
    schoolEndTime: "15:00",
    lessonDurationMinutes: 40,
    passingTimeMinutes: 5,
    periodsPerDay: 8,
    events: [
      {
        id: createId("event"),
        name: "Morning Break",
        type: "break",
        startTime: "10:00",
        endTime: "10:20",
        days: [...DEFAULT_DAYS],
        enabled: true,
        countsAsTeachingTime: false,
      },
      {
        id: createId("event"),
        name: "Lunch",
        type: "lunch",
        startTime: "12:20",
        endTime: "13:00",
        days: [...DEFAULT_DAYS],
        enabled: true,
        countsAsTeachingTime: false,
      },
    ],
    allowTeacherDoublePeriods: true,
    allowConsecutiveSameSubject: true,
    maxConsecutiveSameSubject: 2,
    maxLessonsPerSubjectPerDay: 2,
    requireTeacherForEveryLesson: true,
    requireRoomForEveryLesson: false,
    updatedAt: now(),
  };
}

export function createEmptySchoolData(): SchoolData {
  return {
    schemaVersion: 1,
    settings: createDefaultSchoolSettings(),
    teachers: [],
    classes: [],
    subjects: [],
    rooms: [],
    subjectAssignments: [],
    transitionRules: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSchoolData(value: unknown): value is SchoolData {
  if (!isRecord(value)) return false;

  return (
    value.schemaVersion === 1 &&
    isRecord(value.settings) &&
    Array.isArray(value.teachers) &&
    Array.isArray(value.classes) &&
    Array.isArray(value.subjects) &&
    (value.rooms === undefined || Array.isArray(value.rooms)) &&
    Array.isArray(value.subjectAssignments) &&
    Array.isArray(value.transitionRules)
  );
}

function readStoredData(): SchoolData {
  if (typeof window === "undefined") {
    return createEmptySchoolData();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return createEmptySchoolData();

    const parsed: unknown = JSON.parse(raw);

    if (!isSchoolData(parsed)) {
      throw new Error("Stored school data has an unsupported structure.");
    }

    return {
      ...parsed,
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
    };
  } catch (error) {
    console.error("Unable to load TimeTable Pro school data.", error);
    throw new Error(
      "School data could not be loaded. Export or recover your data before resetting storage.",
      { cause: error },
    );
  }
}

function writeStoredData(data: SchoolData): void {
  if (typeof window === "undefined") {
    throw new Error("School data can only be saved in a browser environment.");
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    throw new Error(
      "School data could not be saved. Browser storage may be full or unavailable.",
      { cause: error },
    );
  }
}

export function getSchoolData(): SchoolData {
  return clone(readStoredData());
}

/**
 * Replaces the full school dataset.
 * Use this for validated imports and migrations, not ordinary form edits.
 */
export function replaceSchoolData(data: SchoolData): void {
  if (!isSchoolData(data)) {
    throw new Error("The supplied school data is invalid.");
  }

  const issues = validateSchoolData(data);
  const errors = issues.filter((item) => item.severity === "error");

  if (errors.length > 0) {
    throw new Error(
      `School data contains errors: ${errors
        .map((item) => item.message)
        .join(" ")}`,
    );
  }

  writeStoredData(clone(data));
}

function updateData(
  updater: (current: SchoolData) => SchoolData,
): SchoolData {
  const current = readStoredData();
  const updated = updater(current);

  writeStoredData(updated);
  return clone(updated);
}

export function updateSchoolSettings(
  changes: Partial<Omit<SchoolSettings, "updatedAt">>,
): SchoolSettings {
  const data = updateData((current) => ({
    ...current,
    settings: {
      ...current.settings,
      ...changes,
      updatedAt: now(),
    },
  }));

  return data.settings;
}

export function addTeacher(
  input: Omit<TeacherRecord, "id" | "createdAt" | "updatedAt">,
): TeacherRecord {
  const data = readStoredData();

  if (
    input.employeeCode.trim() &&
    data.teachers.some(
      (teacher) =>
        teacher.employeeCode.trim().toLowerCase() ===
        input.employeeCode.trim().toLowerCase(),
    )
  ) {
    throw new Error("That employee code is already in use.");
  }

  const timestamp = now();
  const teacher: TeacherRecord = {
    ...input,
    id: createId("teacher"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  updateData((current) => ({
    ...current,
    teachers: [...current.teachers, teacher],
  }));

  return clone(teacher);
}

export function updateTeacher(
  id: string,
  changes: Partial<Omit<TeacherRecord, "id" | "createdAt">>,
): TeacherRecord {
  const data = readStoredData();
  const existing = data.teachers.find((teacher) => teacher.id === id);

  if (!existing) throw new Error("Teacher not found.");

  const nextEmployeeCode = changes.employeeCode ?? existing.employeeCode;

  if (
    nextEmployeeCode.trim() &&
    data.teachers.some(
      (teacher) =>
        teacher.id !== id &&
        teacher.employeeCode.trim().toLowerCase() ===
          nextEmployeeCode.trim().toLowerCase(),
    )
  ) {
    throw new Error("That employee code is already in use.");
  }

  const updated: TeacherRecord = {
    ...existing,
    ...changes,
    id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };

  updateData((current) => ({
    ...current,
    teachers: current.teachers.map((teacher) =>
      teacher.id === id ? updated : teacher,
    ),
  }));

  return clone(updated);
}

export function deleteTeacher(id: string): void {
  updateData((current) => ({
    ...current,
    teachers: current.teachers.filter((teacher) => teacher.id !== id),
    subjectAssignments: current.subjectAssignments.map((assignment) => ({
      ...assignment,
      eligibleTeacherIds: assignment.eligibleTeacherIds.filter(
        (teacherId) => teacherId !== id,
      ),
      preferredTeacherId:
        assignment.preferredTeacherId === id
          ? null
          : assignment.preferredTeacherId,
      updatedAt: now(),
    })),
  }));
}

export function addClass(
  input: Omit<ClassRecord, "id" | "createdAt" | "updatedAt">,
): ClassRecord {
  const data = readStoredData();
  const duplicate = data.classes.some(
    (item) =>
      item.name.trim().toLowerCase() === input.name.trim().toLowerCase() &&
      item.section.trim().toLowerCase() === input.section.trim().toLowerCase() &&
      item.academicYear.trim() === input.academicYear.trim(),
  );

  if (duplicate) {
    throw new Error(
      "A class with this name, section, and academic year already exists.",
    );
  }

  const timestamp = now();
  const record: ClassRecord = {
    ...input,
    id: createId("class"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  updateData((current) => ({
    ...current,
    classes: [...current.classes, record],
  }));

  return clone(record);
}

export function updateClass(
  id: string,
  changes: Partial<Omit<ClassRecord, "id" | "createdAt">>,
): ClassRecord {
  const existing = readStoredData().classes.find((item) => item.id === id);

  if (!existing) throw new Error("Class not found.");

  const updated: ClassRecord = {
    ...existing,
    ...changes,
    id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };

  updateData((current) => ({
    ...current,
    classes: current.classes.map((item) => (item.id === id ? updated : item)),
  }));

  return clone(updated);
}

export function deleteClass(id: string): void {
  updateData((current) => ({
    ...current,
    classes: current.classes.filter((item) => item.id !== id),
    subjectAssignments: current.subjectAssignments.filter(
      (item) => item.classId !== id,
    ),
    transitionRules: current.transitionRules.map((rule) => ({
      ...rule,
      applicableClassIds: rule.applicableClassIds.filter(
        (classId) => classId !== id,
      ),
      updatedAt: now(),
    })),
    teachers: current.teachers.map((teacher) => ({
      ...teacher,
      eligibleClassIds: teacher.eligibleClassIds.filter(
        (classId) => classId !== id,
      ),
      updatedAt: now(),
    })),
  }));
}

export function addSubject(
  input: Omit<SubjectRecord, "id" | "createdAt" | "updatedAt">,
): SubjectRecord {
  const data = readStoredData();

  if (
    input.code.trim() &&
    data.subjects.some(
      (subject) =>
        subject.code.trim().toLowerCase() === input.code.trim().toLowerCase(),
    )
  ) {
    throw new Error("That subject code is already in use.");
  }

  const timestamp = now();
  const subject: SubjectRecord = {
    ...input,
    id: createId("subject"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  updateData((current) => ({
    ...current,
    subjects: [...current.subjects, subject],
  }));

  return clone(subject);
}

export function updateSubject(
  id: string,
  changes: Partial<Omit<SubjectRecord, "id" | "createdAt">>,
): SubjectRecord {
  const data = readStoredData();
  const existing = data.subjects.find((subject) => subject.id === id);

  if (!existing) throw new Error("Subject not found.");

  const nextCode = changes.code ?? existing.code;

  if (
    nextCode.trim() &&
    data.subjects.some(
      (subject) =>
        subject.id !== id &&
        subject.code.trim().toLowerCase() === nextCode.trim().toLowerCase(),
    )
  ) {
    throw new Error("That subject code is already in use.");
  }

  const updated: SubjectRecord = {
    ...existing,
    ...changes,
    id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };

  updateData((current) => ({
    ...current,
    subjects: current.subjects.map((subject) =>
      subject.id === id ? updated : subject,
    ),
  }));

  return clone(updated);
}

export function deleteSubject(id: string): void {
  updateData((current) => ({
    ...current,
    subjects: current.subjects.filter((subject) => subject.id !== id),
    classes: current.classes.map((classRecord) => ({
      ...classRecord,
      selectedSubjectIds: classRecord.selectedSubjectIds.filter(
        (subjectId) => subjectId !== id,
      ),
      updatedAt: now(),
    })),
    teachers: current.teachers.map((teacher) => ({
      ...teacher,
      qualifiedSubjectIds: teacher.qualifiedSubjectIds.filter(
        (subjectId) => subjectId !== id,
      ),
      updatedAt: now(),
    })),
    subjectAssignments: current.subjectAssignments.filter(
      (assignment) => assignment.subjectId !== id,
    ),
    transitionRules: current.transitionRules.filter(
      (rule) => rule.targetSubjectId !== id,
    ).map((rule) => ({
      ...rule,
      requiredSubjectIds: rule.requiredSubjectIds.filter(
        (subjectId) => subjectId !== id,
      ),
      updatedAt: now(),
    })),
  }));
}

export function addRoom(
  input: Omit<RoomRecord, "id">,
): RoomRecord {
  const data = readStoredData();
  const normalizedName = input.name.trim().toLocaleLowerCase();

  if (!normalizedName) throw new Error("Enter a room name.");
  if (input.capacity < 0 || !Number.isInteger(input.capacity)) {
    throw new Error("Room capacity must be a non-negative whole number.");
  }
  if (
    data.rooms.some(
      (room) => room.name.trim().toLocaleLowerCase() === normalizedName,
    )
  ) {
    throw new Error("A room with this name already exists.");
  }

  const room = { ...input, name: input.name.trim(), id: createId("room") };

  updateData((current) => ({ ...current, rooms: [...current.rooms, room] }));
  return clone(room);
}

export function updateRoom(
  id: string,
  changes: Partial<Omit<RoomRecord, "id">>,
): RoomRecord {
  const data = readStoredData();
  const existing = data.rooms.find((room) => room.id === id);
  if (!existing) throw new Error("Room not found.");

  const updated = { ...existing, ...changes, id };
  const normalizedName = updated.name.trim().toLocaleLowerCase();

  if (!normalizedName) throw new Error("Enter a room name.");
  if (updated.capacity < 0 || !Number.isInteger(updated.capacity)) {
    throw new Error("Room capacity must be a non-negative whole number.");
  }
  if (
    data.rooms.some(
      (room) =>
        room.id !== id &&
        room.name.trim().toLocaleLowerCase() === normalizedName,
    )
  ) {
    throw new Error("A room with this name already exists.");
  }

  updateData((current) => ({
    ...current,
    rooms: current.rooms.map((room) => (room.id === id ? updated : room)),
  }));
  return clone(updated);
}

export function deleteRoom(id: string): void {
  updateData((current) => ({
    ...current,
    rooms: current.rooms.filter((room) => room.id !== id),
  }));
}

export function saveSubjectAssignment(
  input: Omit<SubjectAssignment, "id" | "createdAt" | "updatedAt">,
): SubjectAssignment {
  const data = readStoredData();

  if (!data.subjects.some((subject) => subject.id === input.subjectId)) {
    throw new Error("Choose an existing subject.");
  }

  if (!data.classes.some((classRecord) => classRecord.id === input.classId)) {
    throw new Error("Choose an existing class.");
  }

  if (
    !Number.isInteger(input.weeklyFrequency) ||
    input.weeklyFrequency < 0 ||
    input.weeklyFrequency > 70
  ) {
    throw new Error("Weekly frequency must be a whole number from 0 to 70.");
  }

  if (
    !Number.isInteger(input.periodsPerLesson) ||
    input.periodsPerLesson < 1 ||
    input.periodsPerLesson > 4
  ) {
    throw new Error("Periods per lesson must be a whole number from 1 to 4.");
  }

  const existing = data.subjectAssignments.find(
    (assignment) =>
      assignment.subjectId === input.subjectId &&
      assignment.classId === input.classId,
  );

  const timestamp = now();
  const record: SubjectAssignment = {
    ...input,
    id: existing?.id ?? createId("assignment"),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  updateData((current) => ({
    ...current,
    subjectAssignments: existing
      ? current.subjectAssignments.map((assignment) =>
          assignment.id === existing.id ? record : assignment,
        )
      : [...current.subjectAssignments, record],
  }));

  return clone(record);
}

export function deleteSubjectAssignment(id: string): void {
  updateData((current) => ({
    ...current,
    subjectAssignments: current.subjectAssignments.filter(
      (assignment) => assignment.id !== id,
    ),
  }));
}

export function saveTransitionRule(
  input: Omit<TransitionSubjectRule, "id" | "createdAt" | "updatedAt">,
): TransitionSubjectRule {
  const data = readStoredData();

  if (!data.subjects.some((subject) => subject.id === input.targetSubjectId)) {
    throw new Error("The transition rule's target subject does not exist.");
  }

  if (input.requiredSubjectIds.length === 0) {
    throw new Error(
      "A transition rule must reference at least one triggering subject.",
    );
  }

  const missingTrigger = input.requiredSubjectIds.find(
    (id) => !data.subjects.some((subject) => subject.id === id),
  );

  if (missingTrigger) {
    throw new Error("A transition rule references an unknown subject.");
  }

  if (input.requiredSubjectIds.includes(input.targetSubjectId)) {
    throw new Error("A subject cannot trigger itself as a transition subject.");
  }

  if (
    !Number.isInteger(input.weeklyFrequency) ||
    input.weeklyFrequency < 0 ||
    input.weeklyFrequency > 70
  ) {
    throw new Error("Weekly frequency must be a whole number from 0 to 70.");
  }

  const timestamp = now();
  const record: TransitionSubjectRule = {
    ...input,
    id: createId("transition"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  updateData((current) => ({
    ...current,
    transitionRules: [...current.transitionRules, record],
  }));

  return clone(record);
}

export function updateTransitionRule(
  id: string,
  changes: Partial<Omit<TransitionSubjectRule, "id" | "createdAt">>,
): TransitionSubjectRule {
  const data = readStoredData();
  const existing = data.transitionRules.find((rule) => rule.id === id);

  if (!existing) throw new Error("Transition rule not found.");

  const updated: TransitionSubjectRule = {
    ...existing,
    ...changes,
    id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };

  if (!data.subjects.some((subject) => subject.id === updated.targetSubjectId)) {
    throw new Error("The transition rule's target subject does not exist.");
  }

  if (
    updated.requiredSubjectIds.length === 0 ||
    updated.requiredSubjectIds.includes(updated.targetSubjectId)
  ) {
    throw new Error("The transition rule has an invalid trigger configuration.");
  }

  updateData((current) => ({
    ...current,
    transitionRules: current.transitionRules.map((rule) =>
      rule.id === id ? updated : rule,
    ),
  }));

  return clone(updated);
}

export function deleteTransitionRule(id: string): void {
  updateData((current) => ({
    ...current,
    transitionRules: current.transitionRules.filter((rule) => rule.id !== id),
  }));
}

/**
 * Resolves a class's selected subjects plus any enabled transition subjects.
 * If multiple rules activate the same subject, its weekly frequency is not
 * double-counted: the highest applicable frequency is used.
 */
export function getEffectiveSubjectRequirements(
  classId: string,
): EffectiveSubjectRequirement[] {
  const data = readStoredData();
  const classRecord = data.classes.find((item) => item.id === classId);

  if (!classRecord) throw new Error("Class not found.");

  const results = new Map<string, EffectiveSubjectRequirement>();

  for (const subjectId of classRecord.selectedSubjectIds) {
    const assignment = data.subjectAssignments.find(
      (item) =>
        item.classId === classId &&
        item.subjectId === subjectId &&
        item.active,
    );

    if (!assignment) continue;

    results.set(subjectId, {
      subjectId,
      classId,
      weeklyFrequency: assignment.weeklyFrequency,
      periodsPerLesson: assignment.periodsPerLesson,
      source: "selected",
      transitionRuleIds: [],
    });
  }

  for (const rule of data.transitionRules) {
    if (!rule.enabled) continue;

    if (
      rule.applicableClassIds.length > 0 &&
      !rule.applicableClassIds.includes(classId)
    ) {
      continue;
    }

    if (
      rule.applicableLevelIds.length > 0 &&
      !rule.applicableLevelIds.includes(classRecord.levelId)
    ) {
      continue;
    }

    const selected = new Set(classRecord.selectedSubjectIds);
    const matches =
      rule.matchMode === "all"
        ? rule.requiredSubjectIds.every((id) => selected.has(id))
        : rule.requiredSubjectIds.some((id) => selected.has(id));

    if (!matches) continue;

    const current = results.get(rule.targetSubjectId);

    if (current) {
      current.weeklyFrequency = Math.max(
        current.weeklyFrequency,
        rule.weeklyFrequency,
      );
      current.transitionRuleIds.push(rule.id);
      continue;
    }

    const targetAssignment = data.subjectAssignments.find(
      (item) =>
        item.classId === classId &&
        item.subjectId === rule.targetSubjectId &&
        item.active,
    );

    results.set(rule.targetSubjectId, {
      subjectId: rule.targetSubjectId,
      classId,
      weeklyFrequency: rule.weeklyFrequency,
      periodsPerLesson: targetAssignment?.periodsPerLesson ?? 1,
      source: "transition",
      transitionRuleIds: [rule.id],
    });
  }

  return [...results.values()];
}

export function validateSchoolData(
  data: SchoolData = readStoredData(),
): DataValidationIssue[] {
  const issues: DataValidationIssue[] = [];
  const subjectIds = new Set(data.subjects.map((item) => item.id));
  const classIds = new Set(data.classes.map((item) => item.id));
  const teacherIds = new Set(data.teachers.map((item) => item.id));
  const roomNames = new Set<string>();

  const assignmentKeys = new Set<string>();

  for (const room of data.rooms) {
    const key = room.name.trim().toLocaleLowerCase();
    if (!key || roomNames.has(key)) {
      issues.push({
        code: "INVALID_OR_DUPLICATE_ROOM",
        severity: "error",
        message: "Room names must be non-empty and unique.",
        entityType: "room",
        entityId: room.id,
      });
    }
    roomNames.add(key);

    if (!Number.isInteger(room.capacity) || room.capacity < 0) {
      issues.push({
        code: "INVALID_ROOM_CAPACITY",
        severity: "error",
        message: `${room.name || "A room"} has an invalid capacity.`,
        entityType: "room",
        entityId: room.id,
      });
    }
  }

  for (const assignment of data.subjectAssignments) {
    const key = `${assignment.classId}:${assignment.subjectId}`;

    if (assignmentKeys.has(key)) {
      issues.push({
        code: "DUPLICATE_SUBJECT_ASSIGNMENT",
        severity: "error",
        message: "A subject has more than one assignment for the same class.",
        entityType: "subjectAssignment",
        entityId: assignment.id,
      });
    }

    assignmentKeys.add(key);

    if (!subjectIds.has(assignment.subjectId) || !classIds.has(assignment.classId)) {
      issues.push({
        code: "BROKEN_SUBJECT_ASSIGNMENT_REFERENCE",
        severity: "error",
        message: "A subject assignment references a missing subject or class.",
        entityType: "subjectAssignment",
        entityId: assignment.id,
      });
    }

    for (const teacherId of assignment.eligibleTeacherIds) {
      if (!teacherIds.has(teacherId)) {
        issues.push({
          code: "UNKNOWN_ELIGIBLE_TEACHER",
          severity: "error",
          message: "A subject assignment references a teacher that no longer exists.",
          entityType: "subjectAssignment",
          entityId: assignment.id,
        });
      }
    }
  }

  for (const teacher of data.teachers) {
    for (const subjectId of teacher.qualifiedSubjectIds) {
      if (!subjectIds.has(subjectId)) {
        issues.push({
          code: "UNKNOWN_TEACHER_SUBJECT",
          severity: "error",
          message: `${teacher.name} has a qualification for a missing subject.`,
          entityType: "teacher",
          entityId: teacher.id,
        });
      }
    }
  }

  for (const classRecord of data.classes) {
    for (const subjectId of classRecord.selectedSubjectIds) {
      if (!subjectIds.has(subjectId)) {
        issues.push({
          code: "UNKNOWN_CLASS_SUBJECT",
          severity: "error",
          message: `${classRecord.name} selects a subject that no longer exists.`,
          entityType: "class",
          entityId: classRecord.id,
        });
      }
    }
  }

  for (const rule of data.transitionRules) {
    if (!subjectIds.has(rule.targetSubjectId)) {
      issues.push({
        code: "UNKNOWN_TRANSITION_TARGET",
        severity: "error",
        message: `Transition rule "${rule.name}" has a missing target subject.`,
        entityType: "transitionRule",
        entityId: rule.id,
      });
    }

    if (rule.requiredSubjectIds.some((id) => !subjectIds.has(id))) {
      issues.push({
        code: "UNKNOWN_TRANSITION_TRIGGER",
        severity: "error",
        message: `Transition rule "${rule.name}" references a missing triggering subject.`,
        entityType: "transitionRule",
        entityId: rule.id,
      });
    }
  }

  if (data.settings.schoolDays.length === 0) {
    issues.push({
      code: "NO_SCHOOL_DAYS",
      severity: "error",
      message: "Configure at least one school day in Settings.",
    });
  }

  if (
    !Number.isInteger(data.settings.periodsPerDay) ||
    data.settings.periodsPerDay < 1 ||
    data.settings.periodsPerDay > 20
  ) {
    issues.push({
      code: "INVALID_PERIOD_COUNT",
      severity: "error",
      message: "Periods per day must be a whole number from 1 to 20.",
    });
  }

  if (data.classes.length === 0) {
    issues.push({
      code: "NO_CLASSES",
      severity: "warning",
      message: "Add at least one class before generating a school timetable.",
    });
  }

  if (data.subjects.length === 0) {
    issues.push({
      code: "NO_SUBJECTS",
      severity: "warning",
      message: "Add subjects before assigning lessons.",
    });
  }

  if (data.teachers.length === 0) {
    issues.push({
      code: "NO_TEACHERS",
      severity: "warning",
      message: "Add teachers before generating a fully assigned timetable.",
    });
  }

  return issues;
}

export function createSchoolRecordId(prefix: string): string {
  return createId(prefix);
}