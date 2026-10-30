import type { Lesson, Timetable } from "../types";
import type {
  ClassRecord,
  EffectiveSubjectRequirement,
  RoomRecord,
  SchoolData,
  SchoolDay,
  SubjectAssignment,
  TeacherRecord,
} from "../types/school";
import {
  getEffectiveSubjectRequirements,
  getSchoolData,
} from "./schoolDataService.ts";
import {
  buildDailyTimeline,
  checkTimetableGeneration,
} from "./schoolPlanningService.ts";

type PeriodWindow = {
  startTime: string;
  endTime: string;
};

type LessonRequest = {
  id: string;
  classRecord: ClassRecord;
  requirement: EffectiveSubjectRequirement;
  assignment?: SubjectAssignment;
  subjectName: string;
  candidateTeachers: TeacherRecord[];
  candidateRooms: RoomRecord[];
  requiresRoom: boolean;
};

type Placement = {
  request: LessonRequest;
  day: SchoolDay;
  startPeriod: number;
  teacher: TeacherRecord | null;
  room: RoomRecord | null;
};

type Candidate = {
  day: SchoolDay;
  startPeriod: number;
  teacher: TeacherRecord | null;
  room: RoomRecord | null;
};

const MAX_SEARCH_NODES = 250_000;

function isTeacherAvailable(
  teacher: TeacherRecord,
  day: SchoolDay,
  periods: number[],
  periodWindows: Map<string, PeriodWindow>,
): boolean {
  const unavailable = teacher.unavailableDayPeriods.find(
    (item) => item.day === day,
  )?.periods ?? [];

  if (periods.some((period) => unavailable.includes(period))) return false;

  if (teacher.availability.length === 0) return true;

  return periods.every((period) => {
    const window = periodWindows.get(`${day}:${period}`);
    if (!window) return false;

    return teacher.availability.some(
      (entry) =>
        entry.day === day &&
        entry.available &&
        entry.startTime <= window.startTime &&
        entry.endTime >= window.endTime,
    );
  });
}

function isContiguousBlock(
  day: SchoolDay,
  periods: number[],
  periodWindows: Map<string, PeriodWindow>,
  passingTimeMinutes: number,
): boolean {
  for (let index = 1; index < periods.length; index += 1) {
    const previous = periodWindows.get(`${day}:${periods[index - 1]}`);
    const current = periodWindows.get(`${day}:${periods[index]}`);

    if (!previous || !current) return false;

    const previousEnd = previous.endTime.split(":").map(Number);
    const currentStart = current.startTime.split(":").map(Number);
    const gap =
      currentStart[0] * 60 +
      currentStart[1] -
      (previousEnd[0] * 60 + previousEnd[1]);

    if (gap > passingTimeMinutes) return false;
  }

  return true;
}

function canPlace(
  placement: Placement,
  occupancy: Map<string, LessonRequest>,
  teacherOccupancy: Set<string>,
  roomOccupancy: Set<string>,
  teacherWeeklyLoad: Map<string, number>,
  teacherDailyLoad: Map<string, number>,
  subjectDailyLoad: Map<string, number>,
  subjectPeriods: Map<string, Map<number, string>>,
  settings: SchoolData["settings"],
): boolean {
  const { request, day, startPeriod, teacher, room } = placement;
  const endPeriod = startPeriod + request.requirement.periodsPerLesson - 1;
  const periods = Array.from(
    { length: request.requirement.periodsPerLesson },
    (_, index) => startPeriod + index,
  );
  const subjectKey = `${request.classRecord.id}:${day}:${request.requirement.subjectId}`;

  if (
    (subjectDailyLoad.get(subjectKey) ?? 0) >=
    settings.maxLessonsPerSubjectPerDay
  ) {
    return false;
  }

  for (const period of periods) {
    if (
      period < 1 ||
      period > settings.periodsPerDay ||
      occupancy.has(`${request.classRecord.id}:${day}:${period}`)
    ) {
      return false;
    }

    if (teacher && teacherOccupancy.has(`${teacher.id}:${day}:${period}`)) {
      return false;
    }
    if (room && roomOccupancy.has(`${room.id}:${day}:${period}`)) {
      return false;
    }
  }

  if (teacher) {
    const weeklyLoad = teacherWeeklyLoad.get(teacher.id) ?? 0;
    const dailyLoad =
      teacherDailyLoad.get(`${teacher.id}:${day}`) ?? 0;

    if (weeklyLoad + periods.length > teacher.maxWeeklyPeriods) return false;
    if (dailyLoad + periods.length > teacher.maxDailyPeriods) return false;
  }

  const classDaySubjects =
    subjectPeriods.get(`${request.classRecord.id}:${day}`) ?? new Map();
  const proposed = new Map(classDaySubjects);

  for (const period of periods) {
    proposed.set(period, request.requirement.subjectId);
  }

  const subjectLimit = settings.allowConsecutiveSameSubject
    ? settings.maxConsecutiveSameSubject
    : 1;
  let run = 0;
  let previous = "";

  for (let period = 1; period <= settings.periodsPerDay; period += 1) {
    const current = proposed.get(period) ?? "";
    run = current && current === previous ? run + 1 : current ? 1 : 0;
    previous = current;
    if (run > subjectLimit) return false;
  }

  if (endPeriod > settings.periodsPerDay) return false;
  return true;
}

function listCandidates(
  request: LessonRequest,
  periodWindows: Map<string, PeriodWindow>,
  occupancy: Map<string, LessonRequest>,
  teacherOccupancy: Set<string>,
  roomOccupancy: Set<string>,
  teacherWeeklyLoad: Map<string, number>,
  teacherDailyLoad: Map<string, number>,
  subjectDailyLoad: Map<string, number>,
  subjectPeriods: Map<string, Map<number, string>>,
  settings: SchoolData["settings"],
): Candidate[] {
  const candidates: Candidate[] = [];
  const classDays = request.classRecord.schoolDays.length
    ? request.classRecord.schoolDays
    : settings.schoolDays;

  for (const day of classDays) {
    for (
      let startPeriod = 1;
      startPeriod <= settings.periodsPerDay - request.requirement.periodsPerLesson + 1;
      startPeriod += 1
    ) {
      const periods = Array.from(
        { length: request.requirement.periodsPerLesson },
        (_, index) => startPeriod + index,
      );
      if (
        !isContiguousBlock(
          day,
          periods,
          periodWindows,
          settings.passingTimeMinutes,
        )
      ) {
        continue;
      }

      const teachers: Array<TeacherRecord | null> = [
        ...request.candidateTeachers,
      ];

      if (!settings.requireTeacherForEveryLesson) teachers.push(null);

      for (const teacher of teachers) {
        if (
          teacher &&
          !isTeacherAvailable(teacher, day, periods, periodWindows)
        ) {
          continue;
        }

        const rooms: Array<RoomRecord | null> = request.requiresRoom
          ? request.candidateRooms
          : [null];

        for (const room of rooms) {
          const placement = { request, day, startPeriod, teacher, room };

          if (
            canPlace(
              placement,
              occupancy,
              teacherOccupancy,
              roomOccupancy,
              teacherWeeklyLoad,
              teacherDailyLoad,
              subjectDailyLoad,
              subjectPeriods,
              settings,
            )
          ) {
            candidates.push({ day, startPeriod, teacher, room });
          }
        }
      }
    }
  }

  return candidates;
}

function createRequests(data: SchoolData): LessonRequest[] {
  const requests: LessonRequest[] = [];

  for (const classRecord of data.classes.filter((item) => item.active)) {
    const requirements = getEffectiveSubjectRequirements(classRecord.id);
    const selected = new Set(classRecord.selectedSubjectIds);
    const assigned = new Set(
      data.subjectAssignments
        .filter((item) => item.classId === classRecord.id && item.active)
        .map((item) => item.subjectId),
    );
    const missing = [...selected].filter((subjectId) => !assigned.has(subjectId));

    if (missing.length > 0) {
      throw new Error(
        `${classRecord.name} is missing active assignments for ${missing
          .map(
            (id) =>
              data.subjects.find((subject) => subject.id === id)?.name ??
              "an unknown subject",
          )
          .join(", ")}.`,
      );
    }

    for (const requirement of requirements) {
      const subject = data.subjects.find(
        (item) => item.id === requirement.subjectId && item.active,
      );
      if (!subject) {
        throw new Error(
          `${classRecord.name} has an inactive or missing configured subject.`,
        );
      }

      const assignment = data.subjectAssignments.find(
        (item) =>
          item.classId === classRecord.id &&
          item.subjectId === requirement.subjectId &&
          item.active,
      );

      const requiredRoomTypes = assignment?.roomRequirements ?? [];
      const requiresRoom =
        data.settings.requireRoomForEveryLesson || requiredRoomTypes.length > 0;
      const candidateRooms = data.rooms.filter((room) => {
        if (!room.active) return false;
        if (
          room.capacity > 0 &&
          room.capacity < classRecord.estimatedStudentCount
        ) {
          return false;
        }
        return (
          requiredRoomTypes.length === 0 ||
          requiredRoomTypes.some(
            (type) =>
              type.trim().toLocaleLowerCase() ===
              room.type.trim().toLocaleLowerCase(),
          )
        );
      });

      if (requiresRoom && candidateRooms.length === 0) {
        const typeDescription = requiredRoomTypes.length
          ? ` of type ${requiredRoomTypes.join(" or ")}`
          : "";
        throw new Error(
          `No active${typeDescription} room with enough capacity is available for ${subject.name} in ${classRecord.name}.`,
        );
      }

      const eligibleTeachers = data.teachers.filter((teacher) => {
        const allowed =
          !assignment?.eligibleTeacherIds.length ||
          assignment.eligibleTeacherIds.includes(teacher.id);
        const allowedClass =
          !teacher.eligibleClassIds.length ||
          teacher.eligibleClassIds.includes(classRecord.id);

        return (
          teacher.active &&
          teacher.qualifiedSubjectIds.includes(subject.id) &&
          allowed &&
          allowedClass
        );
      });

      if (data.settings.requireTeacherForEveryLesson && eligibleTeachers.length === 0) {
        throw new Error(
          `No active, qualified teacher is eligible for ${subject.name} in ${classRecord.name}.`,
        );
      }

      eligibleTeachers.sort((a, b) => {
        if (a.id === assignment?.preferredTeacherId) return -1;
        if (b.id === assignment?.preferredTeacherId) return 1;
        return a.name.localeCompare(b.name);
      });

      for (let index = 0; index < requirement.weeklyFrequency; index += 1) {
        requests.push({
          id: `${classRecord.id}:${subject.id}:${index}`,
          classRecord,
          requirement,
          assignment,
          subjectName: subject.name,
          candidateTeachers: eligibleTeachers,
          candidateRooms,
          requiresRoom,
        });
      }
    }
  }

  return requests;
}

export function generateSchoolTimetables(): Timetable[] {
  const data = getSchoolData();
  const preflight = checkTimetableGeneration();
  const blockingIssues = preflight.issues.filter(
    (item) => item.severity === "error",
  );

  if (!preflight.canGenerate || blockingIssues.length > 0) {
    throw new Error(
      blockingIssues.map((item) => item.message).join(" ") ||
        "Complete the school data before generating timetables.",
    );
  }

  const requests = createRequests(data);
  const windowsByDay = new Map<SchoolDay, Map<string, PeriodWindow>>();

  for (const classRecord of data.classes.filter((item) => item.active)) {
    const classDays = classRecord.schoolDays.length
      ? classRecord.schoolDays
      : data.settings.schoolDays;

    for (const day of classDays) {
      let windows = windowsByDay.get(day);

      if (!windows) {
        const timeline = buildDailyTimeline(day, data.settings);
        const issues = timeline.issues.filter(
          (item) => item.severity === "error",
        );

        if (
          issues.length > 0 ||
          timeline.generatedPeriods !== data.settings.periodsPerDay
        ) {
          throw new Error(
            issues.map((item) => item.message).join(" ") ||
              `${day} does not have enough configured time for every period.`,
          );
        }

        windows = new Map(
          timeline.items
            .filter(
              (item): item is typeof item & { period: number } =>
                item.type === "lesson" && item.period !== undefined,
            )
            .map((item) => [
              `${day}:${item.period}`,
              { startTime: item.startTime, endTime: item.endTime },
            ]),
        );
        windowsByDay.set(day, windows);
      }
    }
  }

  const periodWindows = new Map<string, PeriodWindow>();
  for (const dayWindows of windowsByDay.values()) {
    for (const [key, window] of dayWindows) periodWindows.set(key, window);
  }

  const occupancy = new Map<string, LessonRequest>();
  const teacherOccupancy = new Set<string>();
  const roomOccupancy = new Set<string>();
  const teacherWeeklyLoad = new Map<string, number>();
  const teacherDailyLoad = new Map<string, number>();
  const subjectDailyLoad = new Map<string, number>();
  const subjectPeriods = new Map<string, Map<number, string>>();
  const placements: Placement[] = [];
  let searchNodes = 0;

  const orderedRequests = [...requests].sort((a, b) => {
    const aTeacherCount = a.candidateTeachers.length || Number.MAX_SAFE_INTEGER;
    const bTeacherCount = b.candidateTeachers.length || Number.MAX_SAFE_INTEGER;
    return (
      aTeacherCount - bTeacherCount ||
      b.requirement.periodsPerLesson - a.requirement.periodsPerLesson ||
      a.id.localeCompare(b.id)
    );
  });

  function search(index: number): boolean {
    if (index >= orderedRequests.length) return true;
    searchNodes += 1;
    if (searchNodes > MAX_SEARCH_NODES) return false;

    const request = orderedRequests[index];
    const candidates = listCandidates(
      request,
      periodWindows,
      occupancy,
      teacherOccupancy,
      roomOccupancy,
      teacherWeeklyLoad,
      teacherDailyLoad,
      subjectDailyLoad,
      subjectPeriods,
      data.settings,
    );

    for (const candidate of candidates) {
      const placement: Placement = { request, ...candidate };
      const periods = Array.from(
        { length: request.requirement.periodsPerLesson },
        (_, offset) => candidate.startPeriod + offset,
      );
      const subjectKey = `${request.classRecord.id}:${candidate.day}:${request.requirement.subjectId}`;
      const dayKey = `${request.classRecord.id}:${candidate.day}`;
      const classDaySubjects = subjectPeriods.get(dayKey) ?? new Map();

      for (const period of periods) {
        occupancy.set(
          `${request.classRecord.id}:${candidate.day}:${period}`,
          request,
        );
        classDaySubjects.set(period, request.requirement.subjectId);
        if (candidate.teacher) {
          teacherOccupancy.add(`${candidate.teacher.id}:${candidate.day}:${period}`);
        }
        if (candidate.room) {
          roomOccupancy.add(`${candidate.room.id}:${candidate.day}:${period}`);
        }
      }

      subjectPeriods.set(dayKey, classDaySubjects);
      subjectDailyLoad.set(
        subjectKey,
        (subjectDailyLoad.get(subjectKey) ?? 0) + 1,
      );

      if (candidate.teacher) {
        teacherWeeklyLoad.set(
          candidate.teacher.id,
          (teacherWeeklyLoad.get(candidate.teacher.id) ?? 0) + periods.length,
        );
        teacherDailyLoad.set(
          `${candidate.teacher.id}:${candidate.day}`,
          (teacherDailyLoad.get(`${candidate.teacher.id}:${candidate.day}`) ?? 0) +
            periods.length,
        );
      }

      placements.push(placement);

      if (search(index + 1)) return true;

      placements.pop();
      subjectDailyLoad.set(
        subjectKey,
        (subjectDailyLoad.get(subjectKey) ?? 1) - 1,
      );

      if (candidate.teacher) {
        teacherWeeklyLoad.set(
          candidate.teacher.id,
          (teacherWeeklyLoad.get(candidate.teacher.id) ?? periods.length) -
            periods.length,
        );
        teacherDailyLoad.set(
          `${candidate.teacher.id}:${candidate.day}`,
          (teacherDailyLoad.get(`${candidate.teacher.id}:${candidate.day}`) ??
            periods.length) - periods.length,
        );
      }

      for (const period of periods) {
        occupancy.delete(`${request.classRecord.id}:${candidate.day}:${period}`);
        classDaySubjects.delete(period);
        if (candidate.teacher) {
          teacherOccupancy.delete(
            `${candidate.teacher.id}:${candidate.day}:${period}`,
          );
        }
        if (candidate.room) {
          roomOccupancy.delete(`${candidate.room.id}:${candidate.day}:${period}`);
        }
      }

      if (classDaySubjects.size === 0) subjectPeriods.delete(dayKey);
    }

    return false;
  }

  if (!search(0)) {
    if (searchNodes > MAX_SEARCH_NODES) {
      throw new Error(
        "The scheduling constraints exceeded the search limit. Try reducing weekly requirements or teacher restrictions.",
      );
    }

    throw new Error(
      "No timetable satisfies the configured class capacity, teacher availability, qualification, workload, and subject-sequencing constraints. No timetable was created.",
    );
  }

  const lessonsByClass = new Map<string, Lesson[]>();
  for (const placement of placements) {
    const { request, day, startPeriod, teacher, room } = placement;
    const lessons = lessonsByClass.get(request.classRecord.id) ?? [];

    for (
      let offset = 0;
      offset < request.requirement.periodsPerLesson;
      offset += 1
    ) {
      const period = startPeriod + offset;
      lessons.push({
        id: `${request.id}:${day}:${period}`,
        day,
        period,
        subject: request.subjectName,
        teacher: teacher?.name ?? "",
        room: room?.name ?? "",
      });
    }

    lessonsByClass.set(request.classRecord.id, lessons);
  }

  return data.classes
    .filter((item) => item.active)
    .map((classRecord) => {
      const classSubjects = getEffectiveSubjectRequirements(classRecord.id)
        .map(
          (requirement) =>
            data.subjects.find((subject) => subject.id === requirement.subjectId)
              ?.name,
        )
        .filter((subject): subject is string => Boolean(subject));
      const classDays = classRecord.schoolDays.length
        ? classRecord.schoolDays
        : data.settings.schoolDays;

      return {
        id: crypto.randomUUID(),
        name: `${classRecord.name}${classRecord.section ? ` ${classRecord.section}` : ""} timetable`,
        schoolName: data.settings.schoolName,
        className: `${classRecord.name}${classRecord.section ? ` ${classRecord.section}` : ""}`,
        days: classDays,
        periodsPerDay: data.settings.periodsPerDay,
        subjects: classSubjects,
        teachers: {},
        rooms: {},
        lessons: (lessonsByClass.get(classRecord.id) ?? []).sort(
          (a, b) =>
            classDays.indexOf(a.day) - classDays.indexOf(b.day) ||
            a.period - b.period,
        ),
        updatedAt: Date.now(),
      };
    });
}
