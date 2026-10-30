
import type { Lesson, SchoolDay, Timetable } from "../types";

const BACKUP_FORMAT = "timetable-pro-backup";
const BACKUP_VERSION = 1;

const VALID_DAYS: SchoolDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface TimetableBackup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_VERSION;
  exportedAt: string;
  timetables: Timetable[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isLesson(value: unknown): value is Lesson {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.day === "string" &&
    VALID_DAYS.includes(value.day as SchoolDay) &&
    Number.isInteger(value.period) &&
    typeof value.subject === "string" &&
    typeof value.teacher === "string" &&
    typeof value.room === "string"
  );
}

export function isTimetableRecord(value: unknown): value is Timetable {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id !== "draft" &&
    typeof value.name === "string" &&
    typeof value.className === "string" &&
    Array.isArray(value.days) &&
    value.days.every(
      (day) => typeof day === "string" && VALID_DAYS.includes(day as SchoolDay),
    ) &&
    Number.isInteger(value.periodsPerDay) &&
    Number(value.periodsPerDay) >= 1 &&
    Number(value.periodsPerDay) <= 12 &&
    Array.isArray(value.subjects) &&
    value.subjects.every((subject) => typeof subject === "string") &&
    isStringRecord(value.teachers) &&
    isStringRecord(value.rooms) &&
    Array.isArray(value.lessons) &&
    value.lessons.every(isLesson) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

export function createTimetableBackup(
  timetables: readonly Timetable[],
): string {
  if (!timetables.every(isTimetableRecord)) {
    throw new Error("Cannot export invalid timetable data.");
  }

  const backup: TimetableBackup = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    timetables: [...timetables],
  };

  return JSON.stringify(backup, null, 2);
}

export function parseTimetableBackup(json: string): Timetable[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("This backup is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("The backup file has an invalid structure.");
  }

  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error("This file is not a TimeTable Pro backup.");
  }

  if (parsed.schemaVersion !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version: ${String(parsed.schemaVersion)}.`,
    );
  }

  if (!Array.isArray(parsed.timetables)) {
    throw new Error("The backup does not contain a timetable list.");
  }

  if (!parsed.timetables.every(isTimetableRecord)) {
    throw new Error(
      "The backup contains invalid timetable data. No data was imported.",
    );
  }

  const ids = parsed.timetables.map((timetable) => timetable.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error("The backup contains duplicate timetable IDs.");
  }

  return parsed.timetables;
}

export function downloadTimetableBackup(
  timetables: readonly Timetable[],
): void {
  const json = createTimetableBackup(timetables);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `timetable-pro-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
