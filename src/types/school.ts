export type SchoolDay =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type ScheduleEventType =
  | "break"
  | "lunch"
  | "assembly"
  | "activity"
  | "custom";

export type SubjectCategory =
  | "core"
  | "optional"
  | "transition"
  | "elective"
  | "other";

export type TransitionMatchMode = "all" | "any";

export interface TeacherAvailability {
  day: SchoolDay;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface TeacherRecord {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
  qualifiedSubjectIds: string[];
  preferredLevelIds: string[];
  eligibleClassIds: string[];
  availability: TeacherAvailability[];
  maxWeeklyPeriods: number;
  maxDailyPeriods: number;
  unavailableDayPeriods: Array<{
    day: SchoolDay;
    periods: number[];
  }>;
  active: boolean;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClassRecord {
  id: string;
  name: string;
  levelId: string;
  section: string;
  academicYear: string;
  estimatedStudentCount: number;
  schoolDays: SchoolDay[];
  selectedSubjectIds: string[];
  active: boolean;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface SubjectRecord {
  id: string;
  name: string;
  code: string;
  category: SubjectCategory;
  description: string;
  defaultLessonDurationMinutes: number;
  requiresDoublePeriods: boolean;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoomRecord {
  id: string;
  name: string;
  type: string;
  capacity: number;
  active: boolean;
}

/**
 * One record represents a subject's requirements for one class.
 * Weekly frequency is intentionally stored here, not on SubjectRecord.
 */
export interface SubjectAssignment {
  id: string;
  subjectId: string;
  classId: string;
  weeklyFrequency: number;
  periodsPerLesson: number;
  eligibleTeacherIds: string[];
  preferredTeacherId: string | null;
  roomRequirements: string[];
  isRequired: boolean;
  active: boolean;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransitionSubjectRule {
  id: string;
  name: string;
  targetSubjectId: string;
  requiredSubjectIds: string[];
  matchMode: TransitionMatchMode;
  applicableClassIds: string[];
  applicableLevelIds: string[];
  weeklyFrequency: number;
  enabled: boolean;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface SchoolScheduleEvent {
  id: string;
  name: string;
  type: ScheduleEventType;
  startTime: string;
  endTime: string;
  days: SchoolDay[];
  enabled: boolean;
  countsAsTeachingTime: boolean;
}

export interface SchoolSettings {
  schoolName: string;
  schoolCode: string;
  academicYear: string;
  timezone: string;
  schoolDays: SchoolDay[];
  schoolStartTime: string;
  schoolEndTime: string;
  lessonDurationMinutes: number;
  passingTimeMinutes: number;
  periodsPerDay: number;
  events: SchoolScheduleEvent[];
  allowTeacherDoublePeriods: boolean;
  allowConsecutiveSameSubject: boolean;
  maxConsecutiveSameSubject: number;
  maxLessonsPerSubjectPerDay: number;
  requireTeacherForEveryLesson: boolean;
  requireRoomForEveryLesson: boolean;
  updatedAt: number;
}

export interface SchoolData {
  schemaVersion: 1;
  settings: SchoolSettings;
  teachers: TeacherRecord[];
  classes: ClassRecord[];
  subjects: SubjectRecord[];
  rooms: RoomRecord[];
  subjectAssignments: SubjectAssignment[];
  transitionRules: TransitionSubjectRule[];
}

export interface EffectiveSubjectRequirement {
  subjectId: string;
  classId: string;
  weeklyFrequency: number;
  periodsPerLesson: number;
  source: "selected" | "transition";
  transitionRuleIds: string[];
}

export interface DataValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface TimeInterval {
  startTime: string;
  endTime: string;
}

export interface TimetableGenerationPreflight {
  canGenerate: boolean;
  totalRequiredPeriods: number;
  totalAvailablePeriods: number;
  issues: DataValidationIssue[];
}