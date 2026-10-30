
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { getFirebaseServices } from "../firebase";
import type { SchoolData } from "../types/school";
import type { Timetable } from "../types";
import {
  createEmptySchoolData,
  getSchoolData,
  replaceSchoolData,
} from "./schoolDataService";
import { generateSchoolTimetables } from "./schoolScheduler";
import { checkTimetableGeneration } from "./schoolPlanningService";

export type TimetableVersionStatus = "draft" | "published" | "archived";

export interface SchoolAcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
  archived: boolean;
  createdAt: number;
}

export interface SchoolTimetableVersion {
  id: string;
  name: string;
  academicYearId: string;
  status: TimetableVersionStatus;
  timetables: Timetable[];
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  createdBy: string;
}

export interface SchoolAuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: number;
}

export interface SchoolWorkspace {
  ownerId: string;
  schoolData: SchoolData;
  academicYears: SchoolAcademicYear[];
  activeVersionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceMember {
  uid: string;
  email: string;
  displayName: string;
  role: "school_admin" | "scheduler" | "teacher" | "viewer";
  active: boolean;
  createdAt: number;
}

const WORKSPACE_COLLECTION = "schools";
const WORKSPACE_DOCUMENT = "workspace";
const MAX_AUDIT_PAGE_SIZE = 100;

function requireUser() {
  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Sign in before accessing your school workspace.");
  }

  return { user, db };
}

function workspaceRef() {
  const { user, db } = requireUser();
  return doc(db, WORKSPACE_COLLECTION, user.uid, "data", WORKSPACE_DOCUMENT);
}

function versionsRef() {
  const { user, db } = requireUser();
  return collection(db, WORKSPACE_COLLECTION, user.uid, "versions");
}

function auditRef() {
  const { user, db } = requireUser();
  return collection(db, WORKSPACE_COLLECTION, user.uid, "audit");
}

function membersRef() {
  const { user, db } = requireUser();
  return collection(db, WORKSPACE_COLLECTION, user.uid, "members");
}

function now() {
  return Date.now();
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function writeAudit(
  action: string,
  entityType: string,
  entityId: string,
  details: string,
): Promise<void> {
  const { user } = requireUser();

  await addDoc(auditRef(), {
    id: createId("audit"),
    actorId: user.uid,
    action,
    entityType,
    entityId,
    details,
    timestamp: now(),
    serverTimestamp: serverTimestamp(),
  });
}

/**
 * Loads the cloud workspace into the existing local school-data service.
 * Existing local data is preserved if the cloud workspace does not exist.
 */
export async function loadSchoolWorkspace(): Promise<SchoolWorkspace> {
  const { user } = requireUser();
  const reference = workspaceRef();
  const snapshot = await getDoc(reference);

  if (!snapshot.exists()) {
    const localData = getSchoolData();
    const empty = createEmptySchoolData();

    const workspace: SchoolWorkspace = {
      ownerId: user.uid,
      schoolData: localData ?? empty,
      academicYears: [],
      activeVersionId: null,
      createdAt: now(),
      updatedAt: now(),
    };

    await setDoc(reference, {
      ...workspace,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await writeAudit(
      "WORKSPACE_CREATED",
      "school",
      user.uid,
      "Created the cloud school workspace.",
    );

    replaceSchoolData(workspace.schoolData);
    return workspace;
  }

  const data = snapshot.data() as SchoolWorkspace;

  if (data.ownerId !== user.uid) {
    throw new Error("The school workspace owner does not match your account.");
  }

  if (!data.schoolData || data.schoolData.schemaVersion !== 1) {
    throw new Error("The cloud school data has an unsupported schema version.");
  }

  replaceSchoolData(data.schoolData);

  return {
    ...data,
    academicYears: Array.isArray(data.academicYears)
      ? data.academicYears
      : [],
    activeVersionId: data.activeVersionId ?? null,
  };
}

/**
 * Persists the current canonical school data to Firestore.
 * Call this after successful schoolDataService mutations.
 */
export async function saveSchoolWorkspace(
  changes?: Partial<Pick<SchoolWorkspace, "academicYears" | "activeVersionId">>,
): Promise<void> {
  const { user } = requireUser();
  const reference = workspaceRef();
  const snapshot = await getDoc(reference);
  const existing = snapshot.exists()
    ? (snapshot.data() as SchoolWorkspace)
    : null;

  if (existing && existing.ownerId !== user.uid) {
    throw new Error("You cannot update another account's school workspace.");
  }

  const timestamp = now();
  const payload: SchoolWorkspace = {
    ownerId: user.uid,
    schoolData: getSchoolData(),
    academicYears: changes?.academicYears ?? existing?.academicYears ?? [],
    activeVersionId:
      changes?.activeVersionId !== undefined
        ? changes.activeVersionId
        : existing?.activeVersionId ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  await setDoc(reference, {
    ...payload,
    updatedAt: serverTimestamp(),
    createdAt: existing ? existing.createdAt : serverTimestamp(),
  });

  await writeAudit(
    "SCHOOL_DATA_SAVED",
    "school",
    user.uid,
    "Saved school settings, staff, classes, subjects, rooms and assignments.",
  );
}

export function subscribeToSchoolWorkspace(
  onChange: (workspace: SchoolWorkspace) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const reference = workspaceRef();

  return onSnapshot(
    reference,
    (snapshot) => {
      if (!snapshot.exists()) {
        onError(new Error("The school workspace has not been created yet."));
        return;
      }

      const workspace = snapshot.data() as SchoolWorkspace;
      const { user } = requireUser();

      if (workspace.ownerId !== user.uid) {
        onError(new Error("The school workspace owner is invalid."));
        return;
      }

      onChange(workspace);
    },
    (error) => onError(error),
  );
}

export async function createAcademicYear(input: {
  name: string;
  startDate: string;
  endDate: string;
  makeActive?: boolean;
}): Promise<SchoolAcademicYear> {
  const name = input.name.trim();

  if (!name) throw new Error("Enter an academic-year name.");
  if (!input.startDate || !input.endDate) {
    throw new Error("Choose both academic-year dates.");
  }
  if (input.startDate >= input.endDate) {
    throw new Error("The academic-year end date must be after its start date.");
  }

  const workspace = await loadSchoolWorkspace();

  if (
    workspace.academicYears.some(
      (year) => year.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error("An academic year with that name already exists.");
  }

  const timestamp = now();
  const year: SchoolAcademicYear = {
    id: createId("year"),
    name,
    startDate: input.startDate,
    endDate: input.endDate,
    active: Boolean(input.makeActive),
    archived: false,
    createdAt: timestamp,
  };

  const years = [
    ...workspace.academicYears.map((item) => ({
      ...item,
      active: input.makeActive ? false : item.active,
    })),
    year,
  ];

  await saveSchoolWorkspace({ academicYears: years });

  await writeAudit(
    "ACADEMIC_YEAR_CREATED",
    "academic_year",
    year.id,
    `Created academic year ${year.name}.`,
  );

  return year;
}

export async function setActiveAcademicYear(
  academicYearId: string,
): Promise<void> {
  const workspace = await loadSchoolWorkspace();
  const target = workspace.academicYears.find(
    (year) => year.id === academicYearId,
  );

  if (!target) throw new Error("Academic year not found.");
  if (target.archived) throw new Error("An archived year cannot be activated.");

  const years = workspace.academicYears.map((year) => ({
    ...year,
    active: year.id === academicYearId,
  }));

  await saveSchoolWorkspace({ academicYears: years });
  await writeAudit(
    "ACADEMIC_YEAR_ACTIVATED",
    "academic_year",
    academicYearId,
    `Activated academic year ${target.name}.`,
  );
}

export async function archiveAcademicYear(
  academicYearId: string,
): Promise<void> {
  const workspace = await loadSchoolWorkspace();
  const target = workspace.academicYears.find(
    (year) => year.id === academicYearId,
  );

  if (!target) throw new Error("Academic year not found.");
  if (target.active) {
    throw new Error("Set another academic year as active before archiving this one.");
  }

  const years = workspace.academicYears.map((year) =>
    year.id === academicYearId
      ? { ...year, archived: true, active: false }
      : year,
  );

  await saveSchoolWorkspace({ academicYears: years });
  await writeAudit(
    "ACADEMIC_YEAR_ARCHIVED",
    "academic_year",
    academicYearId,
    `Archived academic year ${target.name}.`,
  );
}

export async function generateDraftVersion(
  name: string,
  academicYearId?: string,
): Promise<SchoolTimetableVersion> {
  const { user } = requireUser();
  const cleanName = name.trim();

  if (!cleanName) throw new Error("Enter a name for this timetable draft.");

  const preflight = checkTimetableGeneration();
  const errors = preflight.issues.filter(
    (issue) => issue.severity === "error",
  );

  if (!preflight.canGenerate || errors.length > 0) {
    throw new Error(
      errors.map((issue) => issue.message).join("\n") ||
        "The school data is not ready for timetable generation.",
    );
  }

  const workspace = await loadSchoolWorkspace();
  const activeYear =
    academicYearId ??
    workspace.academicYears.find((year) => year.active)?.id ??
    "";

  const generated = generateSchoolTimetables();

  if (generated.length === 0) {
    throw new Error("The scheduler did not generate any class timetables.");
  }

  const timestamp = now();
  const version: SchoolTimetableVersion = {
    id: createId("version"),
    name: cleanName,
    academicYearId: activeYear,
    status: "draft",
    timetables: generated,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
    createdBy: user.uid,
  };

  await setDoc(doc(versionsRef(), version.id), {
    ...version,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await saveSchoolWorkspace({ activeVersionId: version.id });

  await writeAudit(
    "TIMETABLE_DRAFT_GENERATED",
    "timetable_version",
    version.id,
    `Generated ${generated.length} class timetables in draft "${cleanName}".`,
  );

  return version;
}

export async function listTimetableVersions(): Promise<
  SchoolTimetableVersion[]
> {
  const result = await getDocs(
    query(versionsRef(), orderBy("updatedAt", "desc")),
  );

  return result.docs.map(
    (item) => item.data() as SchoolTimetableVersion,
  );
}

export async function getTimetableVersion(
  versionId: string,
): Promise<SchoolTimetableVersion> {
  const snapshot = await getDoc(doc(versionsRef(), versionId));

  if (!snapshot.exists()) throw new Error("Timetable version not found.");

  return snapshot.data() as SchoolTimetableVersion;
}

export async function publishTimetableVersion(
  versionId: string,
): Promise<SchoolTimetableVersion> {
  const version = await getTimetableVersion(versionId);

  if (version.status === "archived") {
    throw new Error("An archived timetable cannot be published.");
  }

  const timestamp = now();
  const published: SchoolTimetableVersion = {
    ...version,
    status: "published",
    publishedAt: timestamp,
    updatedAt: timestamp,
  };

  await updateDoc(doc(versionsRef(), versionId), {
    status: "published",
    publishedAt: timestamp,
    updatedAt: serverTimestamp(),
  });

  await writeAudit(
    "TIMETABLE_PUBLISHED",
    "timetable_version",
    versionId,
    `Published timetable version "${version.name}".`,
  );

  return published;
}

export async function archiveTimetableVersion(
  versionId: string,
): Promise<void> {
  const version = await getTimetableVersion(versionId);

  await updateDoc(doc(versionsRef(), versionId), {
    status: "archived",
    updatedAt: serverTimestamp(),
  });

  const workspace = await loadSchoolWorkspace();

  if (workspace.activeVersionId === versionId) {
    await saveSchoolWorkspace({ activeVersionId: null });
  }

  await writeAudit(
    "TIMETABLE_ARCHIVED",
    "timetable_version",
    versionId,
    `Archived timetable version "${version.name}".`,
  );
}

export async function restoreTimetableVersion(
  versionId: string,
): Promise<SchoolTimetableVersion> {
  const version = await getTimetableVersion(versionId);

  if (version.status === "archived") {
    throw new Error("Archived versions cannot be restored directly. Create a new draft from an active version.");
  }

  const { user } = requireUser();
  const timestamp = now();

  const restored: SchoolTimetableVersion = {
    ...version,
    id: createId("version"),
    name: `${version.name} (Restored)`,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
    createdBy: user.uid,
    timetables: version.timetables.map((timetable) => ({
      ...timetable,
      id: createId("timetable"),
      updatedAt: timestamp,
    })),
  };

  await setDoc(doc(versionsRef(), restored.id), {
    ...restored,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await saveSchoolWorkspace({ activeVersionId: restored.id });

  await writeAudit(
    "TIMETABLE_VERSION_RESTORED",
    "timetable_version",
    restored.id,
    `Created a restored draft from "${version.name}".`,
  );

  return restored;
}

export async function deleteTimetableVersion(
  versionId: string,
): Promise<void> {
  const version = await getTimetableVersion(versionId);

  if (version.status === "published") {
    throw new Error("Published versions cannot be deleted. Archive them instead.");
  }

  await deleteDoc(doc(versionsRef(), versionId));

  await writeAudit(
    "TIMETABLE_VERSION_DELETED",
    "timetable_version",
    versionId,
    `Deleted timetable version "${version.name}".`,
  );
}

export async function listAuditEntries(
  limit = 50,
): Promise<SchoolAuditEntry[]> {
  const safeLimit = Math.max(
    1,
    Math.min(MAX_AUDIT_PAGE_SIZE, Math.floor(limit)),
  );

  const result = await getDocs(
    query(auditRef(), orderBy("timestamp", "desc")),
  );

  return result.docs
    .slice(0, safeLimit)
    .map((item) => item.data() as SchoolAuditEntry);
}

export function subscribeToAuditLog(
  onChange: (entries: SchoolAuditEntry[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(auditRef(), orderBy("timestamp", "desc")),
    (snapshot) => {
      onChange(
        snapshot.docs
          .slice(0, MAX_AUDIT_PAGE_SIZE)
          .map((item) => item.data() as SchoolAuditEntry),
      );
    },
    (error) => onError(error),
  );
}

/**
 * CSV export of the core school records.
 * The full-fidelity backup format is JSON, not CSV.
 */
export function exportSchoolDataJson(): string {
  return JSON.stringify(getSchoolData(), null, 2);
}

export function downloadSchoolDataJson(
  filename = "timetable-pro-school-backup.json",
): void {
  const blob = new Blob([exportSchoolDataJson()], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export function importSchoolDataJson(json: string): SchoolData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as SchoolData).schemaVersion !== 1
  ) {
    throw new Error("The file is not a supported TimeTable Pro school backup.");
  }

  const candidate = parsed as SchoolData;

  if (
    !candidate.settings ||
    !Array.isArray(candidate.teachers) ||
    !Array.isArray(candidate.classes) ||
    !Array.isArray(candidate.subjects) ||
    (candidate.rooms !== undefined && !Array.isArray(candidate.rooms)) ||
    !Array.isArray(candidate.subjectAssignments) ||
    !Array.isArray(candidate.transitionRules)
  ) {
    throw new Error("The backup is missing one or more required school-data collections.");
  }

  replaceSchoolData({ ...candidate, rooms: candidate.rooms ?? [] });
  return getSchoolData();
}

export function exportTimetableCsv(version: SchoolTimetableVersion): string {
  const quote = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;

  const rows = [
    ["Class", "Day", "Period", "Subject", "Teacher", "Room"],
    ...version.timetables.flatMap((timetable) =>
      timetable.lessons.map((lesson) => [
        timetable.className,
        lesson.day,
        lesson.period,
        lesson.subject,
        lesson.teacher,
        lesson.room,
      ]),
    ),
  ];

  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}

export function downloadTimetableCsv(
  version: SchoolTimetableVersion,
): void {
  const blob = new Blob([exportTimetableCsv(version)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `${version.name.replace(/[^a-z0-9-_]+/gi, "-")}.csv`;
  anchor.click();

  URL.revokeObjectURL(url);
}

/**
 * Client-side permission helper for UI visibility only.
 * Firestore rules remain the actual security boundary.
 */
export function canPerformWorkspaceAction(
  role: "owner" | "school_admin" | "scheduler" | "teacher" | "viewer",
  action:
    | "view"
    | "manage_staff"
    | "manage_classes"
    | "manage_subjects"
    | "manage_settings"
    | "generate"
    | "publish"
    | "manage_members"
    | "view_audit",
): boolean {
  if (role === "owner") return true;
  if (action === "view") return true;

  if (role === "school_admin") {
    return [
      "manage_staff",
      "manage_classes",
      "manage_subjects",
      "manage_settings",
      "generate",
      "publish",
      "manage_members",
      "view_audit",
    ].includes(action);
  }

  if (role === "scheduler") {
    return action === "generate" || action === "view_audit";
  }

  return false;
}

/**
 * Member records are currently owner-managed metadata.
 * Do not use these records to grant access until a trusted invitation flow
 * and matching Firestore security rules are implemented.
 */
export async function listWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const result = await getDocs(membersRef());
  return result.docs.map((item) => item.data() as WorkspaceMember);
}
