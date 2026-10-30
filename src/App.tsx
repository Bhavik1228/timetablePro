
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import type { User } from "firebase/auth";
import { generateLessons } from "./scheduler";
import {
  getCurrentUser,
  signOutUser,
  watchAuthState,
} from "./services/authService";
import {
  deleteTimetable as deleteCloudTimetable,
  saveTimetable as saveCloudTimetable,
  subscribeToTimetables,
} from "./services/timetableService";
import { isTimetableRecord } from "./services/timetableBackup";
import { isFirebaseConfigured } from "./firebase";
import type { Lesson, SchoolDay, Timetable } from "./types";

const DAYS: SchoolDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const STORAGE_KEY = "timetable-pro-saved-v1";

const DEFAULT_SUBJECTS = [
  "Mathematics",
  "English",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
];

function normalizeSavedTimetable(value: unknown): Timetable | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Partial<Timetable>;
  if (typeof record.id !== "string" || !record.id || record.id === "draft") {
    return null;
  }

  const defaultDays: SchoolDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const normalized: Timetable = {
    id: record.id,
    name: typeof record.name === "string" ? record.name : "Untitled timetable",
    className: typeof record.className === "string" ? record.className : "",
    days: Array.isArray(record.days) ? record.days : defaultDays,
    periodsPerDay:
      Number.isInteger(record.periodsPerDay) && record.periodsPerDay > 0
        ? record.periodsPerDay
        : 7,
    subjects: Array.isArray(record.subjects) ? record.subjects : [],
    teachers: record.teachers && typeof record.teachers === "object" ? record.teachers : {},
    rooms: record.rooms && typeof record.rooms === "object" ? record.rooms : {},
    lessons: Array.isArray(record.lessons) ? record.lessons : [],
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
  return isTimetableRecord(normalized) ? normalized : null;
}

function readSaved(): Timetable[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(normalizeSavedTimetable).filter((record): record is Timetable => record !== null)
      : [];
  } catch {
    return [];
  }
}

function makeId(): string {
  return crypto.randomUUID();
}

function downloadCsv(timetable: Timetable) {
  const escapeCsv = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`;

  const rows = [
    ["Day", "Period", "Subject", "Teacher", "Room"],
    ...timetable.lessons.map((lesson) => [
      lesson.day,
      lesson.period,
      lesson.subject,
      lesson.teacher,
      lesson.room,
    ]),
  ];

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `${timetable.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "timetable"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [saved, setSaved] = useState<Timetable[]>(readSaved);
  const [user, setUser] = useState<User | null>(() =>
    isFirebaseConfigured() ? getCurrentUser() : null,
  );
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("My timetable");
  const [className, setClassName] = useState("Year 10");
  const [subjectsText, setSubjectsText] = useState(
    DEFAULT_SUBJECTS.join("\n"),
  );
  const [days, setDays] = useState<SchoolDay[]>([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ]);
  const [periodsPerDay, setPeriodsPerDay] = useState(7);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const subjects = useMemo(
    () =>
      subjectsText
        .split("\n")
        .map((subject) => subject.trim())
        .filter(Boolean),
    [subjectsText],
  );

  useEffect(() => {
    if (!user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    }
  }, [saved, user]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    let unsubscribeTimetables: (() => void) | undefined;

    try {
      const unsubscribeAuth = watchAuthState((nextUser) => {
        setUser(nextUser);
        setError("");
        unsubscribeTimetables?.();
        unsubscribeTimetables = undefined;

        if (!nextUser) {
          setSaved(readSaved());
          return;
        }

        try {
          unsubscribeTimetables = subscribeToTimetables(
            nextUser.uid,
            setSaved,
            (cause) => setError(`Could not load saved timetables: ${cause.message}`),
          );
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load saved timetables.",
          );
        }
      });

      return () => {
        unsubscribeAuth();
        unsubscribeTimetables?.();
      };
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not connect to your account.";
      queueMicrotask(() => setError(message));
    }
  }, []);

  const activeTimetable = useMemo<Timetable>(
    () => ({
      id: selectedId || "draft",
      name,
      className,
      days,
      periodsPerDay,
      subjects,
      teachers: {},
      rooms: {},
      lessons,
      updatedAt: saved.find((record) => record.id === selectedId)?.updatedAt ?? 0,
    }),
    [selectedId, name, className, days, periodsPerDay, subjects, lessons, saved],
  );

  function generate() {
    setError("");
    setNotice("");

    try {
      const generated = generateLessons({
        name,
        className,
        days,
        periodsPerDay,
        subjects,
        teachers: {},
        rooms: {},
        lessons,
      });

      setLessons(generated);
      setNotice("Your timetable has been generated.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not generate timetable.",
      );
    }
  }

  async function saveTimetable() {
    setError("");
    setNotice("");

    if (!name.trim()) {
      setError("Enter a name for your timetable.");
      return;
    }

    if (lessons.length === 0) {
      setError("Generate a timetable before saving it.");
      return;
    }

    const record: Timetable = {
      ...activeTimetable,
      id: selectedId || makeId(),
      name: name.trim(),
      updatedAt: Date.now(),
    };

    if (user) {
      try {
        await saveCloudTimetable(user.uid, record);
        setSelectedId(record.id);
        setNotice("Timetable saved to your account.");
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save your timetable.",
        );
      }
      return;
    }

    setSaved((current) => {
      const exists = current.some((item) => item.id === record.id);
      return exists
        ? current.map((item) => (item.id === record.id ? record : item))
        : [record, ...current];
    });

    setSelectedId(record.id);
    setNotice("Timetable saved on this device.");
  }

  function openTimetable(record: Timetable) {
    setSelectedId(record.id);
    setName(record.name || "Untitled timetable");
    setClassName(record.className || "");
    setDays(Array.isArray(record.days) ? record.days : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    setPeriodsPerDay(record.periodsPerDay);
    setSubjectsText(Array.isArray(record.subjects) ? record.subjects.join("\n") : "");
    setLessons(Array.isArray(record.lessons) ? record.lessons : []);
    setError("");
    setNotice(`Opened ${record.name}.`);
  }

  function newTimetable() {
    setSelectedId("");
    setName("Untitled timetable");
    setClassName("Year 10");
    setSubjectsText(DEFAULT_SUBJECTS.join("\n"));
    setDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    setPeriodsPerDay(7);
    setLessons([]);
    setError("");
    setNotice("New timetable created.");
  }

  async function deleteTimetable(id: string) {
    setError("");

    if (user) {
      try {
        await deleteCloudTimetable(user.uid, id);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not delete the saved timetable.",
        );
        return;
      }
    } else {
      setSaved((current) => current.filter((item) => item.id !== id));
    }

    if (selectedId === id) {
      newTimetable();
    }

    setNotice("Saved timetable deleted.");
  }

  async function signOut() {
    setError("");

    try {
      await signOutUser();
      setNotice("You have been signed out.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not sign out.",
      );
    }
  }

  function updateLesson(
    lessonId: string,
    field: "subject" | "teacher" | "room",
    value: string,
  ) {
    setLessons((current) =>
      current.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, [field]: value } : lesson,
      ),
    );
  }

  const periods = Array.from(
    { length: periodsPerDay },
    (_, index) => index + 1,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="TimeTable Pro home">
          <span className="brand-mark">
            <CalendarDays size={21} strokeWidth={1.8} />
          </span>
          <span>timetable<span className="brand-light">pro</span></span>
        </a>

        <div className="topbar-right">
          <span className="local-status">
            <span className="status-dot" />
            {user ? user.email || "Account synced" : "Local workspace"}
          </span>
          {user ? (
            <button className="button button-secondary" onClick={signOut}>
              Sign out
            </button>
          ) : (
            <a className="button button-secondary" href="/signin">
              Sign in
            </a>
          )}
          <button className="button button-primary" onClick={newTimetable}>
            <Plus size={17} />
            New timetable
          </button>
        </div>
      </header>

      <div className="page-content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Make time for what matters.</h1>
            <p className="subheading">
              Build a clear, organised timetable for your school week.
            </p>
          </div>
          <div className="heading-icon">
            <Clock3 size={28} strokeWidth={1.5} />
          </div>
        </section>

        {notice && (
          <div className="notice success-notice" role="status">
            <Check size={17} />
            {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="notice error-notice" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}

        <div className="workspace-grid">
          <aside className="sidebar">
            <section className="panel setup-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">CONFIGURATION</p>
                  <h2>Timetable setup</h2>
                </div>
                <CalendarDays size={19} className="muted-icon" />
              </div>

              <label className="field-label" htmlFor="timetable-name">
                Timetable name
              </label>
              <input
                id="timetable-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. My weekly timetable"
              />

              <label className="field-label" htmlFor="class-name">
                Class or year group
              </label>
              <input
                id="class-name"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder="e.g. Year 10"
              />

              <label className="field-label" htmlFor="school-days">
                School days
              </label>
              <div className="day-selector">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={days.includes(day) ? "day-chip active" : "day-chip"}
                    aria-pressed={days.includes(day)}
                    onClick={() =>
                      setDays((current) =>
                        current.includes(day)
                          ? current.filter((item) => item !== day)
                          : DAYS.filter(
                              (item) => current.includes(item) || item === day,
                            ),
                      )
                    }
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>

              <label className="field-label" htmlFor="period-count">
                Periods per day
              </label>
              <div className="select-wrap">
                <select
                  id="period-count"
                  value={periodsPerDay}
                  onChange={(event) => setPeriodsPerDay(Number(event.target.value))}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (count) => (
                      <option key={count} value={count}>
                        {count} periods
                      </option>
                    ),
                  )}
                </select>
                <ChevronDown size={16} />
              </div>

              <label className="field-label" htmlFor="subject-list">
                Subjects <span className="field-hint">one per line</span>
              </label>
              <textarea
                id="subject-list"
                rows={7}
                value={subjectsText}
                onChange={(event) => setSubjectsText(event.target.value)}
                placeholder={"Mathematics\nEnglish\nBiology"}
              />

              <button className="button button-primary full-width" onClick={generate}>
                <RefreshCw size={16} />
                Generate timetable
              </button>
              <p className="helper-text">
                Generates a balanced rotation from your subject list. It does
                not yet check teacher availability or room conflicts.
              </p>
            </section>

            <section className="panel saved-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">YOUR LIBRARY</p>
                  <h2>Saved timetables</h2>
                </div>
                <span className="count-pill">{saved.length}</span>
              </div>

              {saved.length === 0 ? (
                <div className="empty-saved">
                  <FileText size={23} />
                  <p>No saved timetables yet.</p>
                  <span>Generate one and select Save.</span>
                </div>
              ) : (
                <div className="saved-list">
                  {saved.map((record) => (
                    <div
                      key={record.id}
                      className={
                        selectedId === record.id
                          ? "saved-item selected"
                          : "saved-item"
                      }
                    >
                      <button
                        className="saved-item-open"
                        onClick={() => openTimetable(record)}
                      >
                        <span className="saved-item-icon">
                          <CalendarDays size={17} />
                        </span>
                        <span className="saved-item-copy">
                          <strong>{record.name}</strong>
                          <small>
                            {record.className} · {record.days?.length ?? 0} days
                          </small>
                        </span>
                      </button>
                      <button
                        className="icon-button delete-button"
                        onClick={() => deleteTimetable(record.id)}
                        aria-label={`Delete ${record.name}`}
                        title="Delete timetable"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>

          <section className="panel timetable-panel">
            <div className="timetable-toolbar">
              <div>
                <p className="eyebrow">TIMETABLE PREVIEW</p>
                <h2>{name || "Untitled timetable"}</h2>
                <p className="table-meta">
                  {className || "No class selected"} <span>·</span>{" "}
                  {days.length} school days <span>·</span> {periodsPerDay} periods/day
                </p>
              </div>

              <div className="toolbar-actions">
                <button
                  className="button button-secondary"
                  onClick={saveTimetable}
                  disabled={lessons.length === 0}
                >
                  <Save size={16} />
                  Save
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => downloadCsv(activeTimetable)}
                  disabled={lessons.length === 0}
                >
                  <ArrowDownToLine size={16} />
                  CSV
                </button>
                <button
                  className="button button-secondary print-button"
                  onClick={() => window.print()}
                  disabled={lessons.length === 0}
                >
                  <Printer size={16} />
                  Print / PDF
                </button>
              </div>
            </div>

            {lessons.length === 0 ? (
              <div className="empty-preview">
                <div className="empty-preview-icon">
                  <CalendarDays size={34} strokeWidth={1.4} />
                </div>
                <h3>Your week, organised.</h3>
                <p>
                  Choose your school days and subjects, then generate your first
                  timetable. You can edit each lesson afterwards.
                </p>
                <button className="button button-primary" onClick={generate}>
                  <RefreshCw size={16} />
                  Generate timetable
                </button>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="timetable">
                  <thead>
                    <tr>
                      <th className="period-column">Period</th>
                      {days.map((day) => (
                        <th key={day}>{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period) => (
                      <tr key={period}>
                        <th className="period-number">
                          <span>{String(period).padStart(2, "0")}</span>
                          <small>Period</small>
                        </th>
                        {days.map((day) => {
                          const lesson = lessons.find(
                            (item) => item.day === day && item.period === period,
                          );

                          if (!lesson) {
                            return (
                              <td key={day + period}>
                                <div className="lesson-cell lesson-empty">
                                  <span>—</span>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td key={day + period}>
                              <div className="lesson-cell">
                                <select
                                  aria-label={`${day}, period ${period}, subject`}
                                  value={lesson.subject}
                                  onChange={(event) =>
                                    updateLesson(
                                      lesson.id,
                                      "subject",
                                      event.target.value,
                                    )
                                  }
                                >
                                  {Array.from(
                                    new Set([...subjects, lesson.subject]),
                                  ).map((subject) => (
                                    <option key={subject} value={subject}>
                                      {subject}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  aria-label={`${day}, period ${period}, teacher`}
                                  value={lesson.teacher}
                                  onChange={(event) =>
                                    updateLesson(
                                      lesson.id,
                                      "teacher",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Teacher"
                                />
                                <input
                                  aria-label={`${day}, period ${period}, room`}
                                  value={lesson.room}
                                  onChange={(event) =>
                                    updateLesson(
                                      lesson.id,
                                      "room",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Room"
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="panel-footer">
              <span>
                <span className="status-dot" />
                {lessons.length} lesson slots
              </span>
              <span>Changes are saved when you select Save.</span>
            </div>
          </section>
        </div>

        <footer className="page-footer">
          <span>TimeTable Pro</span>
          <span>Designed for focused school planning.</span>
        </footer>
      </div>
    </main>
  );
}

export default App;
