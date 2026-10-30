// src/services/constraintScheduler.ts

import type {
  SchoolData,
  SchoolDay,
  ScheduledLesson,
  SubjectAssignment,
  Teacher,
  SchoolRoom,
  ValidationIssue,
} from "./schoolCore.ts";

import {
  validateSettings,
  validateSchoolData,
} from "./schoolCore.ts";

export interface SchedulerResult {
  success: boolean;
  lessons: ScheduledLesson[];
  issues: ValidationIssue[];
  requiredPeriods: number;
  scheduledPeriods: number;
  unscheduledAssignments: {
    classId: string;
    subjectId: string;
    remainingPeriods: number;
    reason: string;
  }[];
}

interface Slot {
  day: SchoolDay;
  period: number;
  start: number;
  end: number;
  startTime: string;
  endTime: string;
}

interface Requirement {
  classId: string;
  subjectId: string;
  assignment: SubjectAssignment;
  blockIndex: number;
  blockSize: number;
}

const DAY_ORDER: SchoolDay[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday",
];

function minutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

  if (!match) throw new Error(`Invalid time "${time}". Expected HH:mm.`);

  return Number(match[1]) * 60 + Number(match[2]);
}

function clock(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

function makeSlots(data: SchoolData): Slot[] {
  const settings = data.settings;
  const slots: Slot[] = [];

  const start = minutes(settings.schoolStartTime);
  const end = minutes(settings.schoolEndTime);

  if (
    settings.lessonDurationMinutes <= 0 ||
    settings.periodsPerDay <= 0 ||
    start >= end
  ) {
    throw new Error("School hours or lesson timing settings are invalid.");
  }

  const days = DAY_ORDER.filter((day) =>
    settings.schoolDays.includes(day),
  );

  for (const day of days) {
    let cursor = start;
    let period = 1;
    let safetyCounter = 0;

    while (
      period <= settings.periodsPerDay &&
      cursor + settings.lessonDurationMinutes <= end &&
      safetyCounter < 100
    ) {
      safetyCounter += 1;

      const lessonEnd = cursor + settings.lessonDurationMinutes;

      const conflictingEvent = settings.events
        .filter((event) => event.enabled && event.days.includes(day))
        .map((event) => ({
          start: minutes(event.startTime),
          end: minutes(event.endTime),
        }))
        .find((event) => overlaps(cursor, lessonEnd, event.start, event.end));

      if (conflictingEvent) {
        cursor = conflictingEvent.end + settings.passingTimeMinutes;
        continue;
      }

      slots.push({
        day,
        period,
        start: cursor,
        end: lessonEnd,
        startTime: clock(cursor),
        endTime: clock(lessonEnd),
      });

      period += 1;
      cursor = lessonEnd + settings.passingTimeMinutes;
    }
  }

  return slots;
}

function availableToTeacher(
  teacher: Teacher,
  slot: Slot,
  block: Slot[],
): boolean {
  const unavailable = teacher.unavailableDayPeriods.some(
    (entry) =>
      entry.day === slot.day &&
      block.some((item) => entry.periods.includes(item.period)),
  );

  if (unavailable) return false;

  // An empty availability list means no time-window restrictions.
  const windows = teacher.availability.filter(
    (entry) => entry.day === slot.day,
  );

  if (!teacher.availability.length) return true;

  if (!windows.length) return false;

  const blockStart = block[0].start;
  const blockEnd = block[block.length - 1].end;

  return windows.some((window) => {
    try {
      return (
        minutes(window.startTime) <= blockStart &&
        minutes(window.endTime) >= blockEnd
      );
    } catch {
      return false;
    }
  });
}

function findBlock(
  slots: Slot[],
  day: SchoolDay,
  firstPeriod: number,
  blockSize: number,
): Slot[] | null {
  const result: Slot[] = [];

  for (let offset = 0; offset < blockSize; offset += 1) {
    const slot = slots.find(
      (item) =>
        item.day === day &&
        item.period === firstPeriod + offset,
    );

    if (!slot) return null;
    result.push(slot);
  }

  // Do not create a double lesson spanning an event or an excessive gap.
  for (let i = 1; i < result.length; i += 1) {
    if (
      result[i].start - result[i - 1].end >
      2 * dataPassingTimeFallback
    ) {
      return null;
    }
  }

  return result;
}

// Kept small and explicit so adjacent configured periods can be checked.
const dataPassingTimeFallback = 60;

function roomFits(
  room: SchoolRoom,
  classSize: number,
  requiredTypes: string[],
): boolean {
  if (!room.active) return false;
  if (room.capacity > 0 && room.capacity < classSize) return false;

  if (!requiredTypes.length) return true;

  return requiredTypes.some(
    (type) => room.type.trim().toLowerCase() === type.trim().toLowerCase(),
  );
}

function teacherFits(
  teacher: Teacher,
  requirement: Requirement,
  data: SchoolData,
  block: Slot[],
  lessons: ScheduledLesson[],
): boolean {
  if (!teacher.active) return false;

  if (!teacher.qualifiedSubjectIds.includes(requirement.subjectId)) {
    return false;
  }

  if (
    teacher.eligibleClassIds.length > 0 &&
    !teacher.eligibleClassIds.includes(requirement.classId)
  ) {
    return false;
  }

  if (
    requirement.assignment.eligibleTeacherIds.length > 0 &&
    !requirement.assignment.eligibleTeacherIds.includes(teacher.id)
  ) {
    return false;
  }

  if (!availableToTeacher(teacher, block[0], block)) return false;

  const weeklyCount = lessons
    .filter((lesson) => lesson.teacherId === teacher.id)
    .reduce((total, lesson) => total + lesson.periodCount, 0);

  if (weeklyCount + block.length > teacher.maxWeeklyPeriods) return false;

  const dailyCount = lessons
    .filter(
      (lesson) =>
        lesson.teacherId === teacher.id &&
        lesson.day === block[0].day,
    )
    .reduce((total, lesson) => total + lesson.periodCount, 0);

  if (dailyCount + block.length > teacher.maxDailyPeriods) return false;

  const clashes = lessons.some(
    (lesson) =>
      lesson.teacherId === teacher.id &&
      lesson.day === block[0].day &&
      block.some((slot) =>
        overlaps(
          slot.start,
          slot.end,
          minutes(lesson.startTime),
          minutes(lesson.endTime),
        ),
      ),
  );

  if (clashes) return false;

  // Ensure each period in the block is available and not already occupied.
  for (const slot of block) {
    if (
      lessons.some(
        (lesson) =>
          lesson.teacherId === teacher.id &&
          lesson.day === slot.day &&
          slot.period >= lesson.period &&
          slot.period < lesson.period + lesson.periodCount,
      )
    ) {
      return false;
    }
  }

  void data;
  return true;
}

function classSlotFree(
  lessons: ScheduledLesson[],
  classId: string,
  block: Slot[],
): boolean {
  return !lessons.some(
    (lesson) =>
      lesson.classId === classId &&
      lesson.day === block[0].day &&
      block.some(
        (slot) =>
          slot.period >= lesson.period &&
          slot.period < lesson.period + lesson.periodCount,
      ),
  );
}

function roomFree(
  lessons: ScheduledLesson[],
  roomId: string,
  block: Slot[],
): boolean {
  return !lessons.some(
    (lesson) =>
      lesson.roomId === roomId &&
      lesson.day === block[0].day &&
      block.some(
        (slot) =>
          slot.period >= lesson.period &&
          slot.period < lesson.period + lesson.periodCount,
      ),
  );
}

function scoreTeacher(
  teacher: Teacher,
  assignment: SubjectAssignment,
  classLevelId: string,
  lessons: ScheduledLesson[],
): number {
  let score = 0;

  if (assignment.preferredTeacherId === teacher.id) score += 100;

  // Preferences influence ranking; they never override hard constraints.
  if (teacher.preferredLevelIds.includes(classLevelId)) score += 30;

  const existingWorkload = lessons
    .filter((lesson) => lesson.teacherId === teacher.id)
    .reduce((total, lesson) => total + lesson.periodCount, 0);

  // Slightly prefer teachers with less assigned work.
  score -= existingWorkload;

  return score;
}

function buildRequirements(data: SchoolData): Requirement[] {
  const requirements: Requirement[] = [];

  for (const classRecord of data.classes.filter((item) => item.active)) {
    const classAssignments = data.assignments.filter(
      (item) =>
        item.classId === classRecord.id &&
        item.active &&
        (item.required || classRecord.selectedSubjectIds.includes(item.subjectId)),
    );

    for (const assignment of classAssignments) {
      const blockSize = assignment.periodsPerLesson;
      const frequency = assignment.weeklyFrequency;

      if (
        !Number.isInteger(blockSize) ||
        blockSize < 1 ||
        !Number.isInteger(frequency) ||
        frequency < 0
      ) {
        throw new Error(
          `Invalid weekly frequency or lesson block size for assignment ${assignment.id}.`,
        );
      }

      for (let index = 0; index < frequency; index += 1) {
        requirements.push({
          classId: classRecord.id,
          subjectId: assignment.subjectId,
          assignment,
          blockIndex: index,
          blockSize,
        });
      }
    }
  }

  // Schedule the most constrained lessons first.
  return requirements.sort((a, b) => {
    const aOptions = data.teachers.filter(
      (teacher) =>
        teacher.active &&
        teacher.qualifiedSubjectIds.includes(a.subjectId),
    ).length;

    const bOptions = data.teachers.filter(
      (teacher) =>
        teacher.active &&
        teacher.qualifiedSubjectIds.includes(b.subjectId),
    ).length;

    return aOptions - bOptions || b.blockSize - a.blockSize;
  });
}

export function generateConstraintTimetable(
  data: SchoolData,
): SchedulerResult {
  const issues: ValidationIssue[] = [
    ...validateSchoolData(data),
    ...validateSettings(data.settings),
  ];

  if (issues.some((item) => item.severity === "error")) {
    return {
      success: false,
      lessons: [],
      issues,
      requiredPeriods: 0,
      scheduledPeriods: 0,
      unscheduledAssignments: [],
    };
  }

  const slots = makeSlots(data);
  const requirements = buildRequirements(data);

  const requiredPeriods = requirements.reduce(
    (total, requirement) => total + requirement.blockSize,
    0,
  );

  const lessons: ScheduledLesson[] = [];
  const unscheduledAssignments: SchedulerResult["unscheduledAssignments"] = [];
  const slotDays = [...new Set(slots.map((slot) => slot.day))];

  for (const requirement of requirements) {
    const classRecord = data.classes.find(
      (item) => item.id === requirement.classId,
    );

    if (!classRecord) continue;

    const assignment = requirement.assignment;
    let placed = false;

    const days = slotDays.filter((day) =>
      (classRecord.schoolDays.length
        ? classRecord.schoolDays
        : data.settings.schoolDays
      ).includes(day),
    );

    const candidateStarts = days.flatMap((day) =>
      slots
        .filter((slot) => slot.day === day)
        .map((slot) => ({ day, period: slot.period })),
    );

    for (const candidateStart of candidateStarts) {
      const block = findBlock(
        slots,
        candidateStart.day,
        candidateStart.period,
        requirement.blockSize,
      );

      if (!block || !classSlotFree(lessons, requirement.classId, block)) {
        continue;
      }

      const eligibleTeachers = data.teachers
        .filter((teacher) =>
          teacherFits(teacher, requirement, data, block, lessons),
        )
        .sort(
          (a, b) =>
            scoreTeacher(b, assignment, classRecord.levelId, lessons) -
            scoreTeacher(a, assignment, classRecord.levelId, lessons),
        );

      if (!eligibleTeachers.length) continue;

      const requiredTypes = assignment.requiredRoomTypes;
      const classSize = classRecord.studentCount;

      const rooms = data.rooms
        .filter((room) => roomFits(room, classSize, requiredTypes))
        .filter((room) => roomFree(lessons, room.id, block));

      if (requiredTypes.length && !rooms.length) continue;

      const teacher = eligibleTeachers[0];
      const room = rooms[0] ?? null;
      const first = block[0];
      const last = block[block.length - 1];

      lessons.push({
        id: `lesson_${crypto.randomUUID()}`,
        classId: requirement.classId,
        subjectId: requirement.subjectId,
        teacherId: teacher.id,
        roomId: room?.id ?? null,
        day: first.day,
        period: first.period,
        periodCount: requirement.blockSize,
        startTime: first.startTime,
        endTime: last.endTime,
      });

      placed = true;
      break;
    }

    if (!placed) {
      unscheduledAssignments.push({
        classId: requirement.classId,
        subjectId: requirement.subjectId,
        remainingPeriods: requirement.blockSize,
        reason:
          "No valid slot was found with the current teacher, room, availability, and timetable constraints.",
      });
    }
  }

  const scheduledPeriods = lessons.reduce(
    (total, lesson) => total + lesson.periodCount,
    0,
  );

  for (const item of unscheduledAssignments) {
    issues.push({
      severity: "error",
      code: "UNSCHEDULED_LESSON",
      message: `Could not schedule ${item.remainingPeriods} period(s) for class ${item.classId}, subject ${item.subjectId}. ${item.reason}`,
      entityId: item.classId,
    });
  }

  const temporaryVersion = {
    id: "generated-preview",
    name: "Generated Preview",
    academicYearId: data.settings.academicYearId,
    status: "draft" as const,
    lessons,
    createdAt: Date.now(),
    publishedAt: null,
    createdBy: "scheduler",
  };

  // Final validation checks collisions and resource limits.
  const { validateVersion } = requireValidation();
  issues.push(...validateVersion(temporaryVersion, data));

  return {
    success:
      unscheduledAssignments.length === 0 &&
      !issues.some((item) => item.severity === "error"),
    lessons,
    issues,
    requiredPeriods,
    scheduledPeriods,
    unscheduledAssignments,
  };
}

function requireValidation(): {
  validateVersion: typeof import("./schoolCore.ts").validateVersion;
} {
  // Static import is used instead of dynamic module loading.
  return { validateVersion: validateVersionImport };
}

import { validateVersion as validateVersionImport } from "./schoolCore.ts";