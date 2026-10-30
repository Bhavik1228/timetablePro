
import * as XLSX from "xlsx";

import type {
  SchoolData,
  TeacherRecord,
  ClassRecord,
  SubjectRecord,
  RoomRecord,
  SubjectAssignment,
  TransitionSubjectRule,
} from "../types/school";

import {
  getSchoolData,
  replaceSchoolData,
} from "./schoolDataService";

type SpreadsheetRecord = Record<string, unknown>;

function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

function decodeValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }

  return value;
}

function encodeRows<T extends object>(
  items: T[],
): SpreadsheetRecord[] {
  return items.map((item) => {
    const result: SpreadsheetRecord = {};

    for (const [key, value] of Object.entries(item)) {
      result[key] = encodeValue(value);
    }

    return result;
  });
}

function decodeRows<T extends object>(
  rows: SpreadsheetRecord[],
): T[] {
  return rows.map((row) => {
    const result: SpreadsheetRecord = {};

    for (const [key, value] of Object.entries(row)) {
      result[key] = decodeValue(value);
    }

    return result as T;
  });
}

function readSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
): SpreadsheetRecord[] {
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<SpreadsheetRecord>(
    worksheet,
    {
      defval: "",
      raw: false,
    },
  );
}

function addSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  rows: SpreadsheetRecord[],
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
}

/**
 * Export all school management data into one Excel workbook.
 */
export function exportSchoolWorkbook(): void {
  const data = getSchoolData();
  const workbook = XLSX.utils.book_new();

  addSheet(
    workbook,
    "Teachers",
    encodeRows(data.teachers),
  );

  addSheet(
    workbook,
    "Classes",
    encodeRows(data.classes),
  );

  addSheet(
    workbook,
    "Subjects",
    encodeRows(data.subjects),
  );

  addSheet(
    workbook,
    "Rooms",
    encodeRows(data.rooms),
  );

  addSheet(
    workbook,
    "Assignments",
    encodeRows(data.subjectAssignments),
  );

  addSheet(
    workbook,
    "Transition Rules",
    encodeRows(data.transitionRules),
  );

  addSheet(workbook, "Settings", [
    {
      settings: JSON.stringify(data.settings),
    },
  ]);

  addSheet(workbook, "Metadata", [
    {
      schemaVersion: data.schemaVersion,
      exportedAt: new Date().toISOString(),
      application: "TimeTable Pro",
    },
  ]);

  XLSX.writeFile(
    workbook,
    "timetable-pro-school-data.xlsx",
  );
}

/**
 * Import school management data from an Excel workbook.
 */
export async function importSchoolWorkbook(
  file: File,
): Promise<SchoolData> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
  });

  const teachers = decodeRows<TeacherRecord>(
    readSheet(workbook, "Teachers"),
  );

  const classes = decodeRows<ClassRecord>(
    readSheet(workbook, "Classes"),
  );

  const subjects = decodeRows<SubjectRecord>(
    readSheet(workbook, "Subjects"),
  );

  const rooms = decodeRows<RoomRecord>(
    readSheet(workbook, "Rooms"),
  );

  const subjectAssignments =
    decodeRows<SubjectAssignment>(
      readSheet(workbook, "Assignments"),
    );

  const transitionRules =
    decodeRows<TransitionSubjectRule>(
      readSheet(workbook, "Transition Rules"),
    );

  const settingsRows = readSheet(
    workbook,
    "Settings",
  );

  let settings = getSchoolData().settings;

  if (settingsRows.length > 0) {
    const settingsValue = settingsRows[0].settings;

    if (
      typeof settingsValue === "string" &&
      settingsValue.trim()
    ) {
      try {
        settings = JSON.parse(
          settingsValue,
        ) as SchoolData["settings"];
      } catch {
        throw new Error(
          "Invalid Settings worksheet. Please use a workbook exported by TimeTable Pro.",
        );
      }
    }
  }

  const importedData: SchoolData = {
    schemaVersion: 1,
    settings,
    teachers,
    classes,
    subjects,
    rooms,
    subjectAssignments,
    transitionRules,
  };

  replaceSchoolData(importedData);

  return importedData;
}

/**
 * Export one school data collection as CSV.
 */
export function exportSchoolSheetAsCsv(
  sheetName:
    | "Teachers"
    | "Classes"
    | "Subjects"
    | "Rooms"
    | "Assignments"
    | "Transition Rules",
): void {
  const data = getSchoolData();

  const sheetData: Record<
    typeof sheetName,
    SpreadsheetRecord[]
  > = {
    Teachers: encodeRows(data.teachers),
    Classes: encodeRows(data.classes),
    Subjects: encodeRows(data.subjects),
    Rooms: encodeRows(data.rooms),
    Assignments: encodeRows(data.subjectAssignments),
    "Transition Rules": encodeRows(data.transitionRules),
  };

  const worksheet = XLSX.utils.json_to_sheet(
    sheetData[sheetName],
  );

  const csv = XLSX.utils.sheet_to_csv(worksheet);

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download =
    `${sheetName.toLowerCase().replaceAll(" ", "-")}.csv`;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}
