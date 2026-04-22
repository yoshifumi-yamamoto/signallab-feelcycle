import fs from "node:fs/promises";

import type { WorkoutInput } from "../types/workout.js";

export async function importWorkoutCsv(filePath: string): Promise<WorkoutInput[]> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const [headerLine, ...rows] = lines;
  if (!headerLine) {
    return [];
  }
  const headers = headerLine.split(",").map((cell) => cell.trim());

  return rows.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    return {
      date: row.date ?? "",
      studio: row.studio ?? "",
      program: row.program ?? "",
      instructorName: row.instructorName ?? "",
      startTime: row.startTime ?? "",
      intensity: row.intensity ?? "",
      subjectiveMemo: row.subjectiveMemo ?? "",
      conditionMemo: row.conditionMemo ?? ""
    };
  });
}
