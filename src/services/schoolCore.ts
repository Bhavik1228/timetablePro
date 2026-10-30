// src/services/schoolCore.ts

export type SchoolDay =
  | "Monday" | "Tuesday" | "Wednesday" | "Thursday"
  | "Friday" | "Saturday" | "Sunday";

export type UserRole =
  | "owner" | "school_admin" | "scheduler"
  | "teacher" | "viewer";

export type SubjectCategory =
  | "core" | "optional" | "transition" | "elective" | "other";

export type EventType =
  | "break" | "lunch" | "assembly" | "activity" | "custom";

export interface Teacher {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
  qualifiedSubjectIds: string[];
  preferredLevelIds: string[];
  eligibleClassIds: string[];
  maxWeeklyPeriods: number;
  maxDailyPeriods: number;
  unavailableDayPeriods: { day: SchoolDay; periods: number[] }[];
  availability: { day: SchoolDay; startTime: string; endTime: string }[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SchoolClass {
  id: string;
  name: string;
  levelId: string;
  section: string;
  academicYearId: string;
  studentCount: number;
  schoolDays: SchoolDay[];
  selectedSubjectIds: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  category: SubjectCategory;
  description: string;
  lessonDurationMinutes: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SubjectAssignment {
  id: string;
  subjectId: string;
  classId: string;
  weeklyFrequency: number;
  periodsPerLesson: number;
  eligibleTeacherIds: string[];
  preferredTeacherId: string | null;
  requiredRoomTypes: string[];
  required: boolean;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SchoolRoom {
  id: string;
  name: string;
  type: string;
  capacity: number;
  active: boolean;
}

export interface SchoolEvent {
  id: string;
  name: string;
  type: EventType;
  startTime: string;
  endTime: string;
  days: SchoolDay[];
  enabled: boolean;
}

export interface SchoolSettings {
  schoolName: string;
  schoolCode: string;
  timezone: string;
  academicYearId: string;
  schoolDays: SchoolDay[];
  schoolStartTime: string;
  schoolEndTime: string;
  lessonDurationMinutes: number;
  passingTimeMinutes: number;
  periodsPerDay: number;
  events: SchoolEvent[];
  maxConsecutiveSameSubject: number;
  maxLessonsPerSubjectPerDay: number;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
  archived: boolean;
}

export interface ScheduledLesson {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  day: SchoolDay;
  period: number;
  periodCount: number;
  startTime: string;
  endTime: string;
  fixed?: boolean;
}

export interface TimetableVersion {
  id: string;
  name: string;
  academicYearId: string;
  status: "draft" | "published" | "archived";
  lessons: ScheduledLesson[];
  createdAt: number;
  publishedAt: number | null;
  createdBy: string;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: number;
  details: string;
}

export interface SchoolData {
  schemaVersion: 1;
  settings: SchoolSettings;
  teachers: Teacher[];
  classes: SchoolClass[];
  subjects: Subject[];
  assignments: SubjectAssignment[];
  rooms: SchoolRoom[];
  academicYears: AcademicYear[];
  versions: TimetableVersion[];
  auditLog: AuditEntry[];
}

export interface Actor {
  id: string;
  role: UserRole;
}

const STORAGE_KEY = "timetable-pro-school-core-v1";

const DAYS: SchoolDay[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday",
];

const WRITE_ROLES: UserRole[] = ["owner", "school_admin"];
const SCHEDULING_ROLES: UserRole[] = [
  "owner", "school_admin", "scheduler",
];

export function canAccess(
  actor: Actor,
  action:
    | "view"
    | "manage_staff"
    | "manage_classes"
    | "manage_subjects"
    | "manage_settings"
    | "generate_timetable"
    | "publish_timetable"
    | "manage_users"
    | "view_audit",
): boolean {
  if (actor.role === "owner") return true;
  if (action === "view") return true;

  if (action === "manage_staff") {
    return WRITE_ROLES.includes(actor.role);
  }

  if (action === "manage_classes" || action === "manage_subjects") {
    return WRITE_ROLES.includes(actor.role);
  }

  if (action === "manage_settings" || action === "manage_users") {
    return actor.role === "school_admin";
  }

  if (action === "generate_timetable") {
    return SCHEDULING_ROLES.includes(actor.role);
  }

  if (action === "publish_timetable") {
    return WRITE_ROLES.includes(actor.role);
  }

  if (action === "view_audit") {
    return WRITE_ROLES.includes(actor.role);
  }

  return false;
}

/**
 * Client-side permissions improve UX but are NOT security boundaries.
 * Production permissions must also be enforced by the authenticated backend.
 */

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeDefaults(): SchoolData {
  const yearId = id("year");

  return {
    schemaVersion: 1,
    settings: {
      schoolName: "",
      schoolCode: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      academicYearId: yearId,
      schoolDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      schoolStartTime: "07:30",
      schoolEndTime: "15:00",
      lessonDurationMinutes: 40,
      passingTimeMinutes: 5,
      periodsPerDay: 7,
      maxConsecutiveSameSubject: 2,
      maxLessonsPerSubjectPerDay: 2,
      events: [
        {
          id: id("event"),
          name: "Morning Break",
          type: "break",
          startTime: "10:00",
          endTime: "10:20",
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          enabled: true,
        },
        {
          id: id("event"),
          name: "Lunch",
          type: "lunch",
          startTime: "12:20",
          endTime: "13:00",
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          enabled: true,
        },
      ],
    },
    teachers: [],
    classes: [],
    subjects: [],
    assignments: [],
    rooms: [],
    academicYears: [{
      id: yearId,
      name: "Current Academic Year",
      startDate: "",
      endDate: "",
      active: true,
      archived: false,
    }],
    versions: [],
    auditLog: [],
  };
}

function validRoot(value: unknown): value is SchoolData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;

  return (
    v.schemaVersion === 1 &&
    !!v.settings &&
    Array.isArray(v.teachers) &&
    Array.isArray(v.classes) &&
    Array.isArray(v.subjects) &&
    Array.isArray(v.assignments) &&
    Array.isArray(v.rooms) &&
    Array.isArray(v.academicYears) &&
    Array.isArray(v.versions) &&
    Array.isArray(v.auditLog)
  );
}

export function getSchoolData(): SchoolData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return makeDefaults();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!validRoot(parsed)) {
      throw new Error("Unsupported school-data format.");
    }
    return clone(parsed);
  } catch {
    throw new Error(
      "School data could not be read. The stored data was not overwritten.",
    );
  }
}

function writeData(data: SchoolData): void {
  const issues = validateSchoolData(data);
  const errors = issues.filter((item) => item.severity === "error");

  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join("\n"));
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      "Could not save school data. Browser storage may be full or unavailable.",
    );
  }
}

function recordAudit(
  data: SchoolData,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  details: unknown,
): void {
  data.auditLog.push({
    id: id("audit"),
    actorId: actor.id,
    action,
    entityType,
    entityId,
    timestamp: Date.now(),
    details: JSON.stringify(details),
  });

  // Keep local browser storage bounded. Production audit logs belong in a DB.
  if (data.auditLog.length > 5000) {
    data.auditLog = data.auditLog.slice(-5000);
  }
}

function mutate<T>(
  actor: Actor,
  permission: Parameters<typeof canAccess>[1],
  action: string,
  entityType: string,
  entityId: string,
  details: unknown,
  change: (data: SchoolData) => T,
): T {
  if (!canAccess(actor, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }

  const data = getSchoolData();
  const result = change(data);

  recordAudit(data, actor, action, entityType, entityId, details);
  writeData(data);

  return clone(result);
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  entityId?: string;
}

export function validateSchoolData(
  data: SchoolData = getSchoolData(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const teacherIds = new Set(data.teachers.map((x) => x.id));
  const classIds = new Set(data.classes.map((x) => x.id));
  const subjectIds = new Set(data.subjects.map((x) => x.id));
  const roomIds = new Set(data.rooms.map((x) => x.id));
  const assignmentKeys = new Set<string>();

  if (!data.settings.schoolDays.length) {
    issues.push({
      severity: "error",
      code: "NO_SCHOOL_DAYS",
      message: "Select at least one school day.",
    });
  }

  if (
    !Number.isInteger(data.settings.periodsPerDay) ||
    data.settings.periodsPerDay < 1 ||
    data.settings.periodsPerDay > 20
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_PERIODS",
      message: "Periods per day must be between 1 and 20.",
    });
  }

  for (const assignment of data.assignments) {
    const key = `${assignment.classId}:${assignment.subjectId}`;

    if (assignmentKeys.has(key)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_ASSIGNMENT",
        message: "A subject has duplicate assignments for the same class.",
        entityId: assignment.id,
      });
    }
    assignmentKeys.add(key);

    if (!classIds.has(assignment.classId) || !subjectIds.has(assignment.subjectId)) {
      issues.push({
        severity: "error",
        code: "BROKEN_ASSIGNMENT",
        message: "A subject assignment references a missing class or subject.",
        entityId: assignment.id,
      });
    }

    if (
      !Number.isInteger(assignment.weeklyFrequency) ||
      assignment.weeklyFrequency < 0 ||
      assignment.weeklyFrequency > 70
    ) {
      issues.push({
        severity: "error",
        code: "INVALID_FREQUENCY",
        message: "Weekly frequency must be between 0 and 70.",
        entityId: assignment.id,
      });
    }

    if (
      !Number.isInteger(assignment.periodsPerLesson) ||
      assignment.periodsPerLesson < 1 ||
      assignment.periodsPerLesson > 4
    ) {
      issues.push({
        severity: "error",
        code: "INVALID_BLOCK_SIZE",
        message: "Periods per lesson must be between 1 and 4.",
        entityId: assignment.id,
      });
    }

    if (
      assignment.preferredTeacherId &&
      !teacherIds.has(assignment.preferredTeacherId)
    ) {
      issues.push({
        severity: "error",
        code: "MISSING_PREFERRED_TEACHER",
        message: "An assignment references a missing preferred teacher.",
        entityId: assignment.id,
      });
    }

    if (assignment.eligibleTeacherIds.some((x) => !teacherIds.has(x))) {
      issues.push({
        severity: "error",
        code: "MISSING_ELIGIBLE_TEACHER",
        message: "An assignment references a missing eligible teacher.",
        entityId: assignment.id,
      });
    }
  }

  for (const teacher of data.teachers) {
    if (teacher.qualifiedSubjectIds.some((x) => !subjectIds.has(x))) {
      issues.push({
        severity: "error",
        code: "MISSING_QUALIFIED_SUBJECT",
        message: `${teacher.name} references a missing qualified subject.`,
        entityId: teacher.id,
      });
    }
  }

  for (const classRecord of data.classes) {
    if (classRecord.selectedSubjectIds.some((x) => !subjectIds.has(x))) {
      issues.push({
        severity: "error",
        code: "MISSING_CLASS_SUBJECT",
        message: `${classRecord.name} references a missing subject.`,
        entityId: classRecord.id,
      });
    }
  }

  for (const lessonVersion of data.versions) {
    const slots = new Set<string>();
    const teacherSlots = new Set<string>();
    const roomSlots = new Set<string>();

    for (const lesson of lessonVersion.lessons) {
      if (
        !classIds.has(lesson.classId) ||
        !subjectIds.has(lesson.subjectId) ||
        !teacherIds.has(lesson.teacherId) ||
        (lesson.roomId && !roomIds.has(lesson.roomId))
      ) {
        issues.push({
          severity: "error",
          code: "BROKEN_TIMETABLE_REFERENCE",
          message: `Timetable version "${lessonVersion.name}" references a missing entity.`,
          entityId: lesson.id,
        });
        continue;
      }

      for (let offset = 0; offset < lesson.periodCount; offset += 1) {
        const slot = `${lesson.day}:${lesson.period + offset}`;
        const classSlot = `${lesson.classId}:${slot}`;
        const teacherSlot = `${lesson.teacherId}:${slot}`;
        const roomSlot = lesson.roomId ? `${lesson.roomId}:${slot}` : "";

        if (slots.has(classSlot)) {
          issues.push({
            severity: "error",
            code: "CLASS_CLASH",
            message: `Class conflict at ${lesson.day}, period ${lesson.period + offset}.`,
            entityId: lesson.id,
          });
        }
        if (teacherSlots.has(teacherSlot)) {
          issues.push({
            severity: "error",
            code: "TEACHER_CLASH",
            message: `Teacher conflict at ${lesson.day}, period ${lesson.period + offset}.`,
            entityId: lesson.id,
          });
        }
        if (roomSlot && roomSlots.has(roomSlot)) {
          issues.push({
            severity: "error",
            code: "ROOM_CLASH",
            message: `Room conflict at ${lesson.day}, period ${lesson.period + offset}.`,
            entityId: lesson.id,
          });
        }

        slots.add(classSlot);
        teacherSlots.add(teacherSlot);
        if (roomSlot) roomSlots.add(roomSlot);
      }
    }
  }

  if (!data.teachers.length) {
    issues.push({
      severity: "warning",
      code: "NO_TEACHERS",
      message: "Add teachers before generating a fully assigned timetable.",
    });
  }

  if (!data.classes.length) {
    issues.push({
      severity: "warning",
      code: "NO_CLASSES",
      message: "Add classes before generating a timetable.",
    });
  }

  return issues;
}

export function saveTeacher(
  actor: Actor,
  input: Omit<Teacher, "createdAt" | "updatedAt"> & {
    createdAt?: number;
    updatedAt?: number;
  },
): Teacher {
  return mutate(actor, "manage_staff", "save", "teacher", input.id, input, (data) => {
    const existing = data.teachers.find((x) => x.id === input.id);

    if (
      input.employeeCode.trim() &&
      data.teachers.some(
        (x) =>
          x.id !== input.id &&
          x.employeeCode.trim().toLowerCase() ===
            input.employeeCode.trim().toLowerCase(),
      )
    ) {
      throw new Error("Employee code must be unique.");
    }

    const timestamp = Date.now();
    const saved: Teacher = {
      ...input,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    data.teachers = existing
      ? data.teachers.map((x) => x.id === input.id ? saved : x)
      : [...data.teachers, saved];

    return saved;
  });
}

export function saveClass(
  actor: Actor,
  input: Omit<SchoolClass, "createdAt" | "updatedAt"> & {
    createdAt?: number;
    updatedAt?: number;
  },
): SchoolClass {
  return mutate(actor, "manage_classes", "save", "class", input.id, input, (data) => {
    const existing = data.classes.find((x) => x.id === input.id);
    const timestamp = Date.now();

    const saved: SchoolClass = {
      ...input,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    data.classes = existing
      ? data.classes.map((x) => x.id === input.id ? saved : x)
      : [...data.classes, saved];

    return saved;
  });
}

export function saveSubject(
  actor: Actor,
  input: Omit<Subject, "createdAt" | "updatedAt"> & {
    createdAt?: number;
    updatedAt?: number;
  },
): Subject {
  return mutate(actor, "manage_subjects", "save", "subject", input.id, input, (data) => {
    const existing = data.subjects.find((x) => x.id === input.id);

    if (
      input.code.trim() &&
      data.subjects.some(
        (x) => x.id !== input.id &&
          x.code.trim().toLowerCase() === input.code.trim().toLowerCase(),
      )
    ) {
      throw new Error("Subject code must be unique.");
    }

    const timestamp = Date.now();
    const saved: Subject = {
      ...input,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    data.subjects = existing
      ? data.subjects.map((x) => x.id === input.id ? saved : x)
      : [...data.subjects, saved];

    return saved;
  });
}

export function saveAssignment(
  actor: Actor,
  input: SubjectAssignment,
): SubjectAssignment {
  return mutate(
    actor, "manage_subjects", "save", "subjectAssignment", input.id, input,
    (data) => {
      if (!data.classes.some((x) => x.id === input.classId)) {
        throw new Error("Select an existing class.");
      }
      if (!data.subjects.some((x) => x.id === input.subjectId)) {
        throw new Error("Select an existing subject.");
      }

      const existing = data.assignments.find((x) =>
        x.id !== input.id &&
        x.classId === input.classId &&
        x.subjectId === input.subjectId,
      );

      if (existing) {
        throw new Error("This subject is already assigned to that class.");
      }

      const saved = {
        ...input,
        updatedAt: Date.now(),
        createdAt: data.assignments.find((x) => x.id === input.id)?.createdAt
          ?? Date.now(),
      };

      data.assignments = data.assignments.some((x) => x.id === input.id)
        ? data.assignments.map((x) => x.id === input.id ? saved : x)
        : [...data.assignments, saved];

      return saved;
    },
  );
}

export function saveRoom(actor: Actor, room: SchoolRoom): SchoolRoom {
  return mutate(actor, "manage_settings", "save", "room", room.id, room, (data) => {
    data.rooms = data.rooms.some((x) => x.id === room.id)
      ? data.rooms.map((x) => x.id === room.id ? room : x)
      : [...data.rooms, room];

    return room;
  });
}

export function saveSchoolSettings(
  actor: Actor,
  settings: SchoolSettings,
): SchoolSettings {
  return mutate(
    actor, "manage_settings", "save", "settings", "school", settings,
    (data) => {
      const issues = validateSettings(settings);
      const errors = issues.filter((x) => x.severity === "error");

      if (errors.length) {
        throw new Error(errors.map((x) => x.message).join("\n"));
      }

      data.settings = clone(settings);
      return data.settings;
    },
  );
}

function toMinutes(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}. Use HH:mm.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function overlaps(
  startA: number, endA: number, startB: number, endB: number,
): boolean {
  return startA < endB && startB < endA;
}

export function validateSettings(
  settings: SchoolSettings,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  try {
    if (toMinutes(settings.schoolStartTime) >= toMinutes(settings.schoolEndTime)) {
      issues.push({
        severity: "error",
        code: "INVALID_SCHOOL_HOURS",
        message: "School end time must be after school start time.",
      });
    }
  } catch (error) {
    issues.push({
      severity: "error",
      code: "INVALID_SCHOOL_TIME",
      message: error instanceof Error ? error.message : "Invalid school hours.",
    });
  }

  if (
    !Number.isInteger(settings.lessonDurationMinutes) ||
    settings.lessonDurationMinutes < 1 ||
    settings.lessonDurationMinutes > 240
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_LESSON_DURATION",
      message: "Lesson duration must be between 1 and 240 minutes.",
    });
  }

  if (
    !Number.isInteger(settings.passingTimeMinutes) ||
    settings.passingTimeMinutes < 0 ||
    settings.passingTimeMinutes > 60
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_PASSING_TIME",
      message: "Passing time must be between 0 and 60 minutes.",
    });
  }

  const events = settings.events.filter((x) => x.enabled);

  for (const event of events) {
    try {
      const start = toMinutes(event.startTime);
      const end = toMinutes(event.endTime);

      if (start >= end) {
        issues.push({
          severity: "error",
          code: "INVALID_EVENT_INTERVAL",
          message: `${event.name}: end time must be after start time.`,
        });
      }

      if (
        start < toMinutes(settings.schoolStartTime) ||
        end > toMinutes(settings.schoolEndTime)
      ) {
        issues.push({
          severity: "error",
          code: "EVENT_OUTSIDE_SCHOOL",
          message: `${event.name} must fall within school hours.`,
        });
      }
    } catch (error) {
      issues.push({
        severity: "error",
        code: "INVALID_EVENT_TIME",
        message: error instanceof Error ? error.message : "Invalid event time.",
      });
    }
  }

  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i];
      const b = events[j];

      if (!a.days.some((day) => b.days.includes(day))) continue;

      try {
        if (overlaps(
          toMinutes(a.startTime), toMinutes(a.endTime),
          toMinutes(b.startTime), toMinutes(b.endTime),
        )) {
          issues.push({
            severity: "error",
            code: "OVERLAPPING_EVENTS",
            message: `${a.name} overlaps ${b.name}.`,
          });
        }
      } catch {
        // Invalid time errors have already been reported.
      }
    }
  }

  return issues;
}

export function saveTimetableVersion(
  actor: Actor,
  input: Omit<TimetableVersion, "id" | "createdAt" | "publishedAt">,
): TimetableVersion {
  return mutate(
    actor, "generate_timetable", "save_version", "timetableVersion",
    input.name, input, (data) => {
      const version: TimetableVersion = {
        ...input,
        id: id("version"),
        createdAt: Date.now(),
        publishedAt: null,
        status: "draft",
        lessons: clone(input.lessons),
      };

      data.versions.push(version);
      return version;
    },
  );
}

export function publishTimetableVersion(
  actor: Actor,
  versionId: string,
): TimetableVersion {
  return mutate(
    actor, "publish_timetable", "publish", "timetableVersion",
    versionId, {}, (data) => {
      const version = data.versions.find((x) => x.id === versionId);
      if (!version) throw new Error("Timetable version not found.");

      const errors = validateVersion(version, data)
        .filter((x) => x.severity === "error");

      if (errors.length) {
        throw new Error(
          `Cannot publish this timetable:\n${errors.map((x) => x.message).join("\n")}`,
        );
      }

      for (const other of data.versions) {
        if (
          other.academicYearId === version.academicYearId &&
          other.status === "published"
        ) {
          other.status = "archived";
        }
      }

      version.status = "published";
      version.publishedAt = Date.now();
      return version;
    },
  );
}

export function restoreTimetableVersion(
  actor: Actor,
  versionId: string,
  newName: string,
): TimetableVersion {
  const data = getSchoolData();
  const source = data.versions.find((x) => x.id === versionId);

  if (!source) throw new Error("Timetable version not found.");

  return saveTimetableVersion(actor, {
    name: newName,
    academicYearId: source.academicYearId,
    status: "draft",
    lessons: clone(source.lessons),
    createdBy: actor.id,
  });
}

export function validateVersion(
  version: TimetableVersion,
  data: SchoolData = getSchoolData(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const classIds = new Set(data.classes.map((x) => x.id));
  const subjectIds = new Set(data.subjects.map((x) => x.id));
  const teacherIds = new Set(data.teachers.map((x) => x.id));
  const roomIds = new Set(data.rooms.map((x) => x.id));
  const classSlots = new Set<string>();
  const teacherSlots = new Set<string>();
  const roomSlots = new Set<string>();
  const weeklyTeacherCounts = new Map<string, number>();
  const dailyTeacherCounts = new Map<string, number>();
  const dailySubjectCounts = new Map<string, number>();

  for (const lesson of version.lessons) {
    const classRecord = data.classes.find((x) => x.id === lesson.classId);
    const subject = data.subjects.find((x) => x.id === lesson.subjectId);
    const teacher = data.teachers.find((x) => x.id === lesson.teacherId);

    if (!classIds.has(lesson.classId) || !subjectIds.has(lesson.subjectId)) {
      issues.push({
        severity: "error",
        code: "MISSING_CLASS_OR_SUBJECT",
        message: "A lesson references a missing class or subject.",
        entityId: lesson.id,
      });
      continue;
    }

    if (!teacher || !teacherIds.has(lesson.teacherId)) {
      issues.push({
        severity: "error",
        code: "MISSING_TEACHER",
        message: "A lesson has no valid teacher assigned.",
        entityId: lesson.id,
      });
      continue;
    }

    if (
      lesson.roomId &&
      (!roomIds.has(lesson.roomId) ||
        !data.rooms.find((x) => x.id === lesson.roomId)?.active)
    ) {
      issues.push({
        severity: "error",
        code: "MISSING_ROOM",
        message: "A lesson references an unavailable room.",
        entityId: lesson.id,
      });
    }

    const assignment = data.assignments.find(
      (x) => x.classId === lesson.classId && x.subjectId === lesson.subjectId,
    );

    if (!assignment) {
      issues.push({
        severity: "error",
        code: "MISSING_ASSIGNMENT",
        message: "The lesson's subject is not assigned to its class.",
        entityId: lesson.id,
      });
    }

    if (!teacher.qualifiedSubjectIds.includes(lesson.subjectId)) {
      issues.push({
        severity: "error",
        code: "TEACHER_NOT_QUALIFIED",
        message: `${teacher.name} is not qualified for ${subject?.name ?? "this subject"}.`,
        entityId: lesson.id,
      });
    }

    if (
      teacher.eligibleClassIds.length > 0 &&
      !teacher.eligibleClassIds.includes(lesson.classId)
    ) {
      issues.push({
        severity: "error",
        code: "TEACHER_CLASS_INELIGIBLE",
        message: `${teacher.name} is not eligible for ${classRecord?.name ?? "this class"}.`,
        entityId: lesson.id,
      });
    }

    if (
      assignment?.eligibleTeacherIds.length &&
      !assignment.eligibleTeacherIds.includes(teacher.id)
    ) {
      issues.push({
        severity: "error",
        code: "TEACHER_NOT_ALLOWED",
        message: `${teacher.name} is not allowed for this subject assignment.`,
        entityId: lesson.id,
      });
    }

    const dailyKey = `${lesson.day}:${lesson.period}`;
    const eventConflict = data.settings.events.some((event) => {
      if (!event.enabled || !event.days.includes(lesson.day)) return false;
      try {
        return overlaps(
          toMinutes(lesson.startTime),
          toMinutes(lesson.endTime),
          toMinutes(event.startTime),
          toMinutes(event.endTime),
        );
      } catch {
        return true;
      }
    });

    if (eventConflict) {
      issues.push({
        severity: "error",
        code: "EVENT_CONFLICT",
        message: `A lesson overlaps a school event on ${lesson.day}.`,
        entityId: lesson.id,
      });
    }

    for (let offset = 0; offset < lesson.periodCount; offset += 1) {
      const slot = `${lesson.day}:${lesson.period + offset}`;
      const classSlot = `${lesson.classId}:${slot}`;
      const teacherSlot = `${teacher.id}:${slot}`;
      const roomSlot = lesson.roomId ? `${lesson.roomId}:${slot}` : "";

      if (classSlots.has(classSlot)) {
        issues.push({
          severity: "error",
          code: "CLASS_CLASH",
          message: `Class conflict on ${lesson.day}, period ${lesson.period + offset}.`,
          entityId: lesson.id,
        });
      }
      if (teacherSlots.has(teacherSlot)) {
        issues.push({
          severity: "error",
          code: "TEACHER_CLASH",
          message: `${teacher.name} has overlapping lessons.`,
          entityId: lesson.id,
        });
      }
      if (roomSlot && roomSlots.has(roomSlot)) {
        issues.push({
          severity: "error",
          code: "ROOM_CLASH",
          message: "A room has overlapping lessons.",
          entityId: lesson.id,
        });
      }

      classSlots.add(classSlot);
      teacherSlots.add(teacherSlot);
      if (roomSlot) roomSlots.add(roomSlot);
    }

    for (let offset = 0; offset < lesson.periodCount; offset += 1) {
      const period = lesson.period + offset;
      const unavailable = teacher.unavailableDayPeriods.some(
        (x) => x.day === lesson.day && x.periods.includes(period),
      );

      if (unavailable) {
        issues.push({
          severity: "error",
          code: "TEACHER_UNAVAILABLE",
          message: `${teacher.name} is unavailable on ${lesson.day}, period ${period}.`,
          entityId: lesson.id,
        });
      }
    }

    weeklyTeacherCounts.set(
      teacher.id,
      (weeklyTeacherCounts.get(teacher.id) ?? 0) + lesson.periodCount,
    );

    dailyTeacherCounts.set(
      `${teacher.id}:${lesson.day}`,
      (dailyTeacherCounts.get(`${teacher.id}:${lesson.day}`) ?? 0) +
        lesson.periodCount,
    );

    dailySubjectCounts.set(
      `${lesson.classId}:${lesson.subjectId}:${lesson.day}`,
      (dailySubjectCounts.get(`${lesson.classId}:${lesson.subjectId}:${lesson.day}`) ?? 0) + 1,
    );

    void dailyKey;
  }

  for (const teacher of data.teachers) {
    const weekly = weeklyTeacherCounts.get(teacher.id) ?? 0;

    if (weekly > teacher.maxWeeklyPeriods) {
      issues.push({
        severity: "error",
        code: "WEEKLY_TEACHER_LIMIT",
        message: `${teacher.name} exceeds the maximum weekly teaching load.`,
        entityId: teacher.id,
      });
    }

    for (const day of DAYS) {
      if ((dailyTeacherCounts.get(`${teacher.id}:${day}`) ?? 0) >
          teacher.maxDailyPeriods) {
        issues.push({
          severity: "error",
          code: "DAILY_TEACHER_LIMIT",
          message: `${teacher.name} exceeds the daily teaching load on ${day}.`,
          entityId: teacher.id,
        });
      }
    }
  }

  for (const [key, count] of dailySubjectCounts) {
    if (count > data.settings.maxLessonsPerSubjectPerDay) {
      issues.push({
        severity: "warning",
        code: "SUBJECT_DAILY_LIMIT",
        message: `A class has too many daily lessons of one subject (${key}).`,
      });
    }
  }

  return issues;
}

export function exportSchoolBackup(): string {
  return JSON.stringify({
    format: "timetable-pro-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: getSchoolData(),
  }, null, 2);
}

export function importSchoolBackup(
  actor: Actor,
  json: string,
): void {
  if (!canAccess(actor, "manage_settings")) {
    throw new Error("You do not have permission to import school data.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The backup file is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid backup structure.");
  }

  const root = parsed as Record<string, unknown>;

  if (
    root.format !== "timetable-pro-backup" ||
    root.version !== 1 ||
    !validRoot(root.data)
  ) {
    throw new Error("Unsupported or invalid TimeTable Pro backup.");
  }

  const imported = clone(root.data);
  const errors = validateSchoolData(imported)
    .filter((x) => x.severity === "error");

  if (errors.length) {
    throw new Error(
      `Backup rejected. No data imported:\n${errors.map((x) => x.message).join("\n")}`,
    );
  }

  const current = getSchoolData();
  imported.auditLog.push({
    id: id("audit"),
    actorId: actor.id,
    action: "import_backup",
    entityType: "schoolData",
    entityId: "all",
    timestamp: Date.now(),
    details: JSON.stringify({
      previousTeacherCount: current.teachers.length,
      importedTeacherCount: imported.teachers.length,
    }),
  });

  writeData(imported);
}

export function downloadSchoolBackup(): void {
  const blob = new Blob([exportSchoolBackup()], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `timetable-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportLessonsCsv(version: TimetableVersion): string {
  const data = getSchoolData();

  const quote = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const rows = [
    [
      "Class", "Subject", "Teacher", "Room", "Day", "Period",
      "Periods", "Start", "End", "Version",
    ],
    ...version.lessons.map((lesson) => [
      data.classes.find((x) => x.id === lesson.classId)?.name ?? "",
      data.subjects.find((x) => x.id === lesson.subjectId)?.name ?? "",
      data.teachers.find((x) => x.id === lesson.teacherId)?.name ?? "",
      data.rooms.find((x) => x.id === lesson.roomId)?.name ?? "",
      lesson.day,
      lesson.period,
      lesson.periodCount,
      lesson.startTime,
      lesson.endTime,
      version.name,
    ]),
  ];

  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}

export function downloadLessonsCsv(version: TimetableVersion): void {
  const blob = new Blob([exportLessonsCsv(version)], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${version.name.replace(/[^a-z0-9-_]/gi, "_")}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getAuditLog(): AuditEntry[] {
  return getSchoolData().auditLog.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Cloud adapter contract.
 * Implement this using the selected provider's authenticated SDK and server-side
 * authorisation. Do not pass secret service-role keys to browser code.
 */
export interface SchoolRepository {
  load(): Promise<SchoolData>;
  save(data: SchoolData): Promise<void>;
}

export function createLocalRepository(): SchoolRepository {
  return {
    async load() {
      return getSchoolData();
    },
    async save(data) {
      writeData(data);
    },
  };
}