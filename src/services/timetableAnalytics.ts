
import type { SchoolDay, Timetable } from "../types";
import { validateTimetable } from "./scheduleValidation";

export interface SubjectWorkload {
  subject: string;
  lessons: number;
  daysUsed: number;
}

export interface ResourceWorkload {
  name: string;
  lessons: number;
  daysUsed: number;
  periodsUsed: number;
}

export interface DayWorkload {
  day: SchoolDay;
  lessons: number;
  occupiedPeriods: number;
  freePeriods: number;
}

export interface TimetableAnalytics {
  totalLessons: number;
  configuredSlots: number;
  occupiedSlots: number;
  freeSlots: number;
  occupancyPercent: number;
  averageLessonsPerDay: number;
  subjectWorkload: SubjectWorkload[];
  teacherWorkload: ResourceWorkload[];
  roomWorkload: ResourceWorkload[];
  dayWorkload: DayWorkload[];
  unassignedTeacherLessons: number;
  unassignedRoomLessons: number;
  validationErrors: number;
  validationWarnings: number;
}

export function calculateTimetableAnalytics(
  timetable: Timetable,
): TimetableAnalytics {
  const subjectMap = new Map<
    string,
    { displayName: string; lessons: number; days: Set<string> }
  >();

  const teacherMap = new Map<
    string,
    { lessons: number; days: Set<string>; periods: Set<string> }
  >();

  const roomMap = new Map<
    string,
    { lessons: number; days: Set<string>; periods: Set<string> }
  >();

  const dayMap = new Map<SchoolDay, number>(
    timetable.days.map((day) => [day, 0]),
  );

  const occupied = new Set<string>();
  let unassignedTeacherLessons = 0;
  let unassignedRoomLessons = 0;

  for (const lesson of timetable.lessons) {
    const slot = `${lesson.day}:${lesson.period}`;
    occupied.add(slot);

    if (dayMap.has(lesson.day)) {
      dayMap.set(lesson.day, (dayMap.get(lesson.day) ?? 0) + 1);
    }

    const subjectKey = lesson.subject.trim().toLocaleLowerCase();

    if (subjectKey) {
      const entry = subjectMap.get(subjectKey) ?? {
        displayName: lesson.subject.trim(),
        lessons: 0,
        days: new Set<string>(),
      };

      entry.lessons += 1;
      entry.days.add(lesson.day);
      subjectMap.set(subjectKey, entry);
    }

    if (!lesson.teacher.trim()) {
      unassignedTeacherLessons += 1;
    } else {
      const key = lesson.teacher.trim().toLocaleLowerCase();
      const entry = teacherMap.get(key) ?? {
        lessons: 0,
        days: new Set<string>(),
        periods: new Set<string>(),
      };

      entry.lessons += 1;
      entry.days.add(lesson.day);
      entry.periods.add(slot);
      teacherMap.set(key, entry);
    }

    if (!lesson.room.trim()) {
      unassignedRoomLessons += 1;
    } else {
      const key = lesson.room.trim().toLocaleLowerCase();
      const entry = roomMap.get(key) ?? {
        lessons: 0,
        days: new Set<string>(),
        periods: new Set<string>(),
      };

      entry.lessons += 1;
      entry.days.add(lesson.day);
      entry.periods.add(slot);
      roomMap.set(key, entry);
    }
  }

  const configuredSlots = timetable.days.length * timetable.periodsPerDay;
  const occupiedSlots = [...occupied].filter((slot) => {
    const separator = slot.lastIndexOf(":");
    const day = slot.slice(0, separator) as SchoolDay;
    const period = Number(slot.slice(separator + 1));

    return (
      timetable.days.includes(day) &&
      Number.isInteger(period) &&
      period >= 1 &&
      period <= timetable.periodsPerDay
    );
  }).length;

  const validation = validateTimetable(timetable);
  const totalDayCount = timetable.days.length;

  return {
    totalLessons: timetable.lessons.length,
    configuredSlots,
    occupiedSlots,
    freeSlots: Math.max(0, configuredSlots - occupiedSlots),
    occupancyPercent:
      configuredSlots === 0
        ? 0
        : Math.round((occupiedSlots / configuredSlots) * 1000) / 10,
    averageLessonsPerDay:
      totalDayCount === 0
        ? 0
        : Math.round((timetable.lessons.length / totalDayCount) * 10) / 10,
    subjectWorkload: [...subjectMap.values()]
      .map((entry) => ({
        subject: entry.displayName,
        lessons: entry.lessons,
        daysUsed: entry.days.size,
      }))
      .sort((a, b) => b.lessons - a.lessons),
    teacherWorkload: [...teacherMap.entries()]
      .map(([key, entry]) => ({
        name: key,
        lessons: entry.lessons,
        daysUsed: entry.days.size,
        periodsUsed: entry.periods.size,
      }))
      .sort((a, b) => b.lessons - a.lessons),
    roomWorkload: [...roomMap.entries()]
      .map(([key, entry]) => ({
        name: key,
        lessons: entry.lessons,
        daysUsed: entry.days.size,
        periodsUsed: entry.periods.size,
      }))
      .sort((a, b) => b.lessons - a.lessons),
    dayWorkload: timetable.days.map((day) => {
      const lessons = dayMap.get(day) ?? 0;
      return {
        day,
        lessons,
        occupiedPeriods: new Set(
          timetable.lessons
            .filter((lesson) => lesson.day === day)
            .map((lesson) => lesson.period),
        ).size,
        freePeriods: Math.max(0, timetable.periodsPerDay - lessons),
      };
    }),
    unassignedTeacherLessons,
    unassignedRoomLessons,
    validationErrors: validation.filter((item) => item.severity === "error")
      .length,
    validationWarnings: validation.filter(
      (item) => item.severity === "warning",
    ).length,
  };
}
