export type SchoolDay =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export interface Lesson {
  id: string;
  day: SchoolDay;
  period: number;
  subject: string;
  teacher: string;
  room: string;
}

export interface Timetable {
  id: string;
  name: string;
  schoolName?: string;
  className: string;
  days: SchoolDay[];
  periodsPerDay: number;
  subjects: string[];
  teachers: Record<string, string>;
  rooms: Record<string, string>;
  lessons: Lesson[];
  updatedAt: number;
}

export type TimetableInput = Omit<Timetable, "id" | "updatedAt">;
