import type { Lesson, TimetableInput } from "./types";

export function generateLessons(input: TimetableInput): Lesson[] {
  const subjects = input.subjects
    .map((subject) => subject.trim())
    .filter(Boolean);

  if (input.days.length === 0) {
    throw new Error("Select at least one school day.");
  }

  if (subjects.length === 0) {
    throw new Error("Add at least one subject.");
  }

  if (
    !Number.isInteger(input.periodsPerDay) ||
    input.periodsPerDay < 1 ||
    input.periodsPerDay > 12
  ) {
    throw new Error("Periods per day must be between 1 and 12.");
  }

  const lessons: Lesson[] = [];
  let subjectIndex = 0;

  for (const day of input.days) {
    const subjectsUsedToday = new Set<string>();

    for (let period = 1; period <= input.periodsPerDay; period += 1) {
      let subject = subjects[subjectIndex % subjects.length];

      if (subjectsUsedToday.size < subjects.length) {
        let attempts = 0;

        while (
          subjectsUsedToday.has(subject) &&
          attempts < subjects.length
        ) {
          subjectIndex += 1;
          subject = subjects[subjectIndex % subjects.length];
          attempts += 1;
        }
      }

      lessons.push({
        id: `${day}-${period}`,
        day,
        period,
        subject,
        teacher: input.teachers[subject] ?? "",
        room: input.rooms[subject] ?? "",
      });

      subjectsUsedToday.add(subject);
      subjectIndex += 1;
    }
  }

  return lessons;
}
