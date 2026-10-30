
import type { Lesson, SchoolDay, Timetable } from "../types";

export type IssueSeverity = "error" | "warning" | "info";

export interface ScheduleIssue {
  id: string;
  severity: IssueSeverity;
  code: string;
  message: string;
  day?: SchoolDay;
  period?: number;
  lessonIds?: string[];
}

export interface ScheduleValidationOptions {
  requireTeacher?: boolean;
  requireRoom?: boolean;
  requireCompleteTimetable?: boolean;
  maxLessonsPerSubjectPerDay?: number;
  maxConsecutiveSameSubject?: number;
}

const VALID_DAYS: SchoolDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function issue(
  severity: IssueSeverity,
  code: string,
  message: string,
  extra: Partial<ScheduleIssue> = {},
): ScheduleIssue {
  return {
    id: `${code}-${extra.day ?? "week"}-${extra.period ?? "all"}-${extra.lessonIds?.join("-") ?? "general"}`,
    severity,
    code,
    message,
    ...extra,
  };
}

export function validateTimetable(
  timetable: Timetable,
  options: ScheduleValidationOptions = {},
): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const {
    requireTeacher = false,
    requireRoom = false,
    requireCompleteTimetable = false,
    maxLessonsPerSubjectPerDay,
    maxConsecutiveSameSubject = 2,
  } = options;

  if (!timetable.name.trim()) {
    issues.push(issue("error", "MISSING_NAME", "Give this timetable a name."));
  }

  if (!Number.isInteger(timetable.periodsPerDay) ||
      timetable.periodsPerDay < 1 ||
      timetable.periodsPerDay > 12) {
    issues.push(
      issue(
        "error",
        "INVALID_PERIOD_COUNT",
        "Periods per day must be a whole number from 1 to 12.",
      ),
    );
    return issues;
  }

  if (timetable.days.length === 0) {
    issues.push(
      issue("error", "NO_SCHOOL_DAYS", "Select at least one school day."),
    );
    return issues;
  }

  const configuredDays = new Set(timetable.days);

  if (configuredDays.size !== timetable.days.length) {
    issues.push(
      issue("error", "DUPLICATE_DAYS", "The school-day list contains duplicates."),
    );
  }

  for (const day of timetable.days) {
    if (!VALID_DAYS.includes(day)) {
      issues.push(
        issue("error", "INVALID_DAY", `Unsupported school day: ${day}.`),
      );
    }
  }

  const configuredSubjects = new Set(
    timetable.subjects.map(normalize).filter(Boolean),
  );

  if (configuredSubjects.size === 0) {
    issues.push(
      issue("error", "NO_SUBJECTS", "Add at least one subject."),
    );
  }

  const slots = new Map<string, Lesson[]>();
  const teacherSlots = new Map<string, Lesson[]>();
  const roomSlots = new Map<string, Lesson[]>();
  const dailySubjects = new Map<string, Lesson[]>();
  const subjectByDayAndPeriod = new Map<string, Lesson>();

  for (const lesson of timetable.lessons) {
    const slotKey = `${lesson.day}:${lesson.period}`;
    const slotLessons = slots.get(slotKey) ?? [];
    slotLessons.push(lesson);
    slots.set(slotKey, slotLessons);

    if (!configuredDays.has(lesson.day)) {
      issues.push(
        issue(
          "error",
          "LESSON_ON_DISABLED_DAY",
          `${lesson.subject || "A lesson"} is scheduled on ${lesson.day}, which is not enabled.`,
          { day: lesson.day, period: lesson.period, lessonIds: [lesson.id] },
        ),
      );
    }

    if (
      !Number.isInteger(lesson.period) ||
      lesson.period < 1 ||
      lesson.period > timetable.periodsPerDay
    ) {
      issues.push(
        issue(
          "error",
          "INVALID_LESSON_PERIOD",
          `Period ${lesson.period} is outside the configured school day.`,
          { day: lesson.day, period: lesson.period, lessonIds: [lesson.id] },
        ),
      );
    }

    const subjectKey = normalize(lesson.subject);

    if (!subjectKey) {
      issues.push(
        issue(
          "error",
          "EMPTY_SUBJECT",
          "A lesson has no subject assigned.",
          { day: lesson.day, period: lesson.period, lessonIds: [lesson.id] },
        ),
      );
    } else {
      if (!configuredSubjects.has(subjectKey)) {
        issues.push(
          issue(
            "warning",
            "UNKNOWN_SUBJECT",
            `"${lesson.subject}" is not in the configured subject list.`,
            { day: lesson.day, period: lesson.period, lessonIds: [lesson.id] },
          ),
        );
      }

      const dailyKey = `${lesson.day}:${subjectKey}`;
      const subjectLessons = dailySubjects.get(dailyKey) ?? [];
      subjectLessons.push(lesson);
      dailySubjects.set(dailyKey, subjectLessons);

      subjectByDayAndPeriod.set(slotKey, lesson);
    }

    if (requireTeacher && !lesson.teacher.trim()) {
      issues.push(
        issue(
          "warning",
          "MISSING_TEACHER",
          `Assign a teacher to ${lesson.subject || "this lesson"}.`,
          { day: lesson.day, period: lesson.period, lessonIds: [lesson.id] },
        ),
      );
    }

    if (requireRoom && !lesson.room.trim()) {
      issues.push(
        issue(
          "warning",
          "MISSING_ROOM",
          `Assign a room to ${lesson.subject || "this lesson"}.`,
          { day: lesson.day, period: lesson.period, lessonIds: [lesson.id] },
        ),
      );
    }

    if (lesson.teacher.trim()) {
      const key = `${slotKey}:${normalize(lesson.teacher)}`;
      const assignments = teacherSlots.get(key) ?? [];
      assignments.push(lesson);
      teacherSlots.set(key, assignments);
    }

    if (lesson.room.trim()) {
      const key = `${slotKey}:${normalize(lesson.room)}`;
      const assignments = roomSlots.get(key) ?? [];
      assignments.push(lesson);
      roomSlots.set(key, assignments);
    }
  }

  for (const [key, assignments] of slots) {
    if (assignments.length > 1) {
      const [day, periodText] = key.split(":");
      issues.push(
        issue(
          "error",
          "DUPLICATE_SLOT",
          `${day}, period ${periodText} has multiple lessons assigned.`,
          {
            day: day as SchoolDay,
            period: Number(periodText),
            lessonIds: assignments.map((lesson) => lesson.id),
          },
        ),
      );
    }
  }

  for (const [key, assignments] of teacherSlots) {
    if (assignments.length > 1) {
      const [day, periodText] = key.split(":");
      const teacher = assignments[0].teacher;

      issues.push(
        issue(
          "error",
          "TEACHER_CONFLICT",
          `${teacher} is assigned to multiple lessons at the same time.`,
          {
            day: day as SchoolDay,
            period: Number(periodText),
            lessonIds: assignments.map((lesson) => lesson.id),
          },
        ),
      );
    }
  }

  for (const [key, assignments] of roomSlots) {
    if (assignments.length > 1) {
      const [day, periodText] = key.split(":");
      const room = assignments[0].room;

      issues.push(
        issue(
          "error",
          "ROOM_CONFLICT",
          `${room} is assigned to multiple lessons at the same time.`,
          {
            day: day as SchoolDay,
            period: Number(periodText),
            lessonIds: assignments.map((lesson) => lesson.id),
          },
        ),
      );
    }
  }

  if (
    maxLessonsPerSubjectPerDay !== undefined &&
    maxLessonsPerSubjectPerDay >= 1
  ) {
    for (const [key, assignments] of dailySubjects) {
      if (assignments.length > maxLessonsPerSubjectPerDay) {
        const [day] = key.split(":");
        issues.push(
          issue(
            "warning",
            "SUBJECT_DAILY_LIMIT",
            `${assignments[0].subject} appears ${assignments.length} times on ${day}, exceeding the configured daily limit of ${maxLessonsPerSubjectPerDay}.`,
            {
              day: day as SchoolDay,
              lessonIds: assignments.map((lesson) => lesson.id),
            },
          ),
        );
      }
    }
  }

  if (maxConsecutiveSameSubject >= 2) {
    for (const day of timetable.days) {
      let previousSubject = "";
      let consecutiveCount = 0;
      let run: Lesson[] = [];

      for (let period = 1; period <= timetable.periodsPerDay; period += 1) {
        const lesson = subjectByDayAndPeriod.get(`${day}:${period}`);
        const currentSubject = lesson ? normalize(lesson.subject) : "";

        if (currentSubject && currentSubject === previousSubject) {
          consecutiveCount += 1;
          if (lesson) run.push(lesson);
        } else {
          consecutiveCount = currentSubject ? 1 : 0;
          run = lesson ? [lesson] : [];
        }

        previousSubject = currentSubject;

        if (consecutiveCount > maxConsecutiveSameSubject && run.length > 0) {
          issues.push(
            issue(
              "warning",
              "CONSECUTIVE_SUBJECT_LIMIT",
              `${lesson?.subject ?? "A subject"} has more than ${maxConsecutiveSameSubject} consecutive periods on ${day}.`,
              {
                day,
                period,
                lessonIds: run.map((item) => item.id),
              },
            ),
          );
        }
      }
    }
  }

  if (requireCompleteTimetable) {
    for (const day of timetable.days) {
      for (let period = 1; period <= timetable.periodsPerDay; period += 1) {
        if (!slots.has(`${day}:${period}`)) {
          issues.push(
            issue(
              "warning",
              "EMPTY_SLOT",
              `${day}, period ${period} has no lesson assigned.`,
              { day, period },
            ),
          );
        }
      }
    }
  }

  return issues;
}

export function getValidationSummary(issues: ScheduleIssue[]) {
  return {
    total: issues.length,
    errors: issues.filter((item) => item.severity === "error").length,
    warnings: issues.filter((item) => item.severity === "warning").length,
    info: issues.filter((item) => item.severity === "info").length,
    isValid: issues.every((item) => item.severity !== "error"),
  };
}
