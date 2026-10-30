import type {
  DataValidationIssue,
  SchoolDay,
  SchoolSettings,
  TimetableGenerationPreflight,
  TimeInterval,
} from "../types/school";

import {
  getEffectiveSubjectRequirements,
  getSchoolData,
  validateSchoolData,
} from "./schoolDataService.ts";

export interface DailyTimelineItem {
  type: "lesson" | "event";
  label: string;
  startTime: string;
  endTime: string;
  period?: number;
  eventId?: string;
}

export interface DailyTimelineResult {
  day: SchoolDay;
  items: DailyTimelineItem[];
  issues: DataValidationIssue[];
  generatedPeriods: number;
}

function timeToMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

  if (!match) {
    throw new Error(`Invalid time "${time}". Use the HH:mm format.`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);

  return aStart < bEnd && bStart < aEnd;
}

function validateTimeInterval(
  interval: TimeInterval,
  label: string,
): DataValidationIssue[] {
  try {
    const start = timeToMinutes(interval.startTime);
    const end = timeToMinutes(interval.endTime);

    if (start >= end) {
      return [{
        code: "INVALID_TIME_INTERVAL",
        severity: "error",
        message: `${label}: the end time must be after the start time.`,
      }];
    }

    return [];
  } catch (error) {
    return [{
      code: "INVALID_TIME_FORMAT",
      severity: "error",
      message: error instanceof Error ? error.message : `${label}: invalid time.`,
    }];
  }
}

export function validateSchoolScheduleSettings(
  settings: SchoolSettings,
): DataValidationIssue[] {
  const issues: DataValidationIssue[] = [];

  const start = validateTimeInterval(
    {
      startTime: settings.schoolStartTime,
      endTime: settings.schoolEndTime,
    },
    "School hours",
  );

  issues.push(...start);

  if (
    !Number.isInteger(settings.lessonDurationMinutes) ||
    settings.lessonDurationMinutes < 1 ||
    settings.lessonDurationMinutes > 240
  ) {
    issues.push({
      code: "INVALID_LESSON_DURATION",
      severity: "error",
      message: "Lesson duration must be between 1 and 240 minutes.",
    });
  }

  if (
    !Number.isInteger(settings.passingTimeMinutes) ||
    settings.passingTimeMinutes < 0 ||
    settings.passingTimeMinutes > 60
  ) {
    issues.push({
      code: "INVALID_PASSING_TIME",
      severity: "error",
      message: "Passing time must be between 0 and 60 minutes.",
    });
  }

  if (
    !Number.isInteger(settings.periodsPerDay) ||
    settings.periodsPerDay < 1 ||
    settings.periodsPerDay > 20
  ) {
    issues.push({
      code: "INVALID_PERIODS_PER_DAY",
      severity: "error",
      message: "Periods per day must be a whole number from 1 to 20.",
    });
  }

  if (
    !Number.isInteger(settings.maxConsecutiveSameSubject) ||
    settings.maxConsecutiveSameSubject < 1
  ) {
    issues.push({
      code: "INVALID_CONSECUTIVE_LIMIT",
      severity: "error",
      message: "The maximum consecutive-subject limit must be at least 1.",
    });
  }

  if (
    !Number.isInteger(settings.maxLessonsPerSubjectPerDay) ||
    settings.maxLessonsPerSubjectPerDay < 1
  ) {
    issues.push({
      code: "INVALID_DAILY_SUBJECT_LIMIT",
      severity: "error",
      message: "The daily subject limit must be at least 1.",
    });
  }

  const enabledEvents = settings.events.filter((event) => event.enabled);

  for (const event of enabledEvents) {
    const eventIssues = validateTimeInterval(event, event.name || "School event");
    issues.push(...eventIssues);

    if (event.days.length === 0) {
      issues.push({
        code: "EVENT_WITHOUT_DAYS",
        severity: "warning",
        message: `${event.name || "A school event"} is enabled but has no assigned days.`,
      });
    }
  }

  for (let i = 0; i < enabledEvents.length; i += 1) {
    for (let j = i + 1; j < enabledEvents.length; j += 1) {
      const first = enabledEvents[i];
      const second = enabledEvents[j];

      const sharesDay = first.days.some((day) => second.days.includes(day));

      if (!sharesDay) continue;

      try {
        if (overlaps(first, second)) {
          issues.push({
            code: "OVERLAPPING_SCHOOL_EVENTS",
            severity: "error",
            message: `"${first.name}" overlaps "${second.name}" on at least one school day.`,
          });
        }
      } catch {
        // The individual invalid-time errors above already explain the problem.
      }
    }
  }

  return issues;
}

/**
 * Builds a real daily timeline, placing events at their configured times
 * and scheduling lessons only in available time intervals.
 *
 * The function does not silently shorten lessons to fit the school day.
 */
export function buildDailyTimeline(
  day: SchoolDay,
  settings: SchoolSettings,
): DailyTimelineResult {
  const issues: DataValidationIssue[] = [
    ...validateSchoolScheduleSettings(settings),
  ];

  const dayIsEnabled = settings.schoolDays.includes(day);

  if (!dayIsEnabled) {
    return {
      day,
      items: [],
      issues: [{
        code: "DAY_NOT_CONFIGURED",
        severity: "error",
        message: `${day} is not enabled in school settings.`,
      }],
      generatedPeriods: 0,
    };
  }

  const blockingErrors = issues.filter((item) => item.severity === "error");

  if (blockingErrors.length > 0) {
    return {
      day,
      items: [],
      issues,
      generatedPeriods: 0,
    };
  }

  const schoolStart = timeToMinutes(settings.schoolStartTime);
  const schoolEnd = timeToMinutes(settings.schoolEndTime);

  const events = settings.events
    .filter((event) => event.enabled && event.days.includes(day))
    .map((event) => ({
      event,
      start: timeToMinutes(event.startTime),
      end: timeToMinutes(event.endTime),
    }))
    .sort((a, b) => a.start - b.start);

  for (const item of events) {
    if (item.start < schoolStart || item.end > schoolEnd) {
      issues.push({
        code: "EVENT_OUTSIDE_SCHOOL_HOURS",
        severity: "error",
        message: `"${item.event.name}" falls outside the configured school hours on ${day}.`,
      });
    }
  }

  if (issues.some((item) => item.severity === "error")) {
    return { day, items: [], issues, generatedPeriods: 0 };
  }

  const items: DailyTimelineItem[] = events.map(({ event }) => ({
    type: "event",
    label: event.name,
    startTime: event.startTime,
    endTime: event.endTime,
    eventId: event.id,
  }));

  let cursor = schoolStart;
  let generatedPeriods = 0;

  for (
    let period = 1;
    period <= settings.periodsPerDay;
    period += 1
  ) {
    let placed = false;

    while (cursor + settings.lessonDurationMinutes <= schoolEnd) {
      const proposed: TimeInterval = {
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + settings.lessonDurationMinutes),
      };

      const conflict = events.find(({ event }) =>
        overlaps(proposed, event),
      );

      if (conflict) {
        cursor = conflict.end + settings.passingTimeMinutes;
        continue;
      }

      items.push({
        type: "lesson",
        label: `Period ${period}`,
        startTime: proposed.startTime,
        endTime: proposed.endTime,
        period,
      });

      generatedPeriods += 1;
      cursor += settings.lessonDurationMinutes + settings.passingTimeMinutes;
      placed = true;
      break;
    }

    if (!placed) {
      issues.push({
        code: "INSUFFICIENT_DAILY_TIME",
        severity: "error",
        message: `Period ${period} cannot fit before the school ends on ${day}. Check school hours, event timings, lesson duration, and passing time.`,
      });
      break;
    }
  }

  items.sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );

  return { day, items, issues, generatedPeriods };
}

export function checkTimetableGeneration(
  classId?: string,
): TimetableGenerationPreflight {
  const data = getSchoolData();
  const issues = validateSchoolData(data);
  issues.push(...validateSchoolScheduleSettings(data.settings));

  let totalRequiredPeriods = 0;

  const classes = classId
    ? data.classes.filter((item) => item.id === classId)
    : data.classes.filter((item) => item.active);

  if (classId && classes.length === 0) {
    issues.push({
      code: "CLASS_NOT_FOUND",
      severity: "error",
      message: "The selected class could not be found.",
      entityType: "class",
      entityId: classId,
    });
  }

  for (const classRecord of classes) {
    const requirements = getEffectiveSubjectRequirements(classRecord.id);

    for (const requirement of requirements) {
      totalRequiredPeriods +=
        requirement.weeklyFrequency * requirement.periodsPerLesson;

      const assignment = data.subjectAssignments.find(
        (item) =>
          item.classId === classRecord.id &&
          item.subjectId === requirement.subjectId &&
          item.active,
      );

      const eligibleTeachers = assignment
        ? assignment.eligibleTeacherIds
        : [];

      const preferredTeacher = assignment?.preferredTeacherId;

      const possibleTeachers = data.teachers.filter((teacher) => {
        if (!teacher.active) return false;

        const qualified = teacher.qualifiedSubjectIds.includes(
          requirement.subjectId,
        );

        const assignmentAllowsTeacher =
          eligibleTeachers.length === 0 ||
          eligibleTeachers.includes(teacher.id);

        const classAllowsTeacher =
          teacher.eligibleClassIds.length === 0 ||
          teacher.eligibleClassIds.includes(classRecord.id);

        return qualified && assignmentAllowsTeacher && classAllowsTeacher;
      });

      if (possibleTeachers.length === 0) {
        issues.push({
          code: "NO_ELIGIBLE_TEACHER",
          severity: "warning",
          message: `No eligible teacher is configured for this subject in ${classRecord.name}.`,
          entityType: "class",
          entityId: classRecord.id,
        });
      } else if (
        preferredTeacher &&
        !possibleTeachers.some((teacher) => teacher.id === preferredTeacher)
      ) {
        issues.push({
          code: "INVALID_PREFERRED_TEACHER",
          severity: "warning",
          message: `The preferred teacher for a subject in ${classRecord.name} is not eligible to teach it.`,
          entityType: "class",
          entityId: classRecord.id,
        });
      }
    }

    const days = classRecord.schoolDays.length
      ? classRecord.schoolDays
      : data.settings.schoolDays;

    const availableForClass = days.length * data.settings.periodsPerDay;

    const requiredForClass = requirements.reduce(
      (total, requirement) =>
        total + requirement.weeklyFrequency * requirement.periodsPerLesson,
      0,
    );

    if (requiredForClass > availableForClass) {
      issues.push({
        code: "CLASS_WEEKLY_CAPACITY_EXCEEDED",
        severity: "error",
        message: `${classRecord.name} requires ${requiredForClass} periods per week but has only ${availableForClass} available timetable slots.`,
        entityType: "class",
        entityId: classRecord.id,
      });
    }
  }

  const activeClasses = classes.length;
  const totalAvailablePeriods = classes.reduce((total, classRecord) => {
    const days = classRecord.schoolDays.length
      ? classRecord.schoolDays
      : data.settings.schoolDays;

    return total + days.length * data.settings.periodsPerDay;
  }, 0);

  const errors = issues.filter((item) => item.severity === "error");

  return {
    canGenerate: activeClasses > 0 && errors.length === 0,
    totalRequiredPeriods,
    totalAvailablePeriods,
    issues,
  };
}