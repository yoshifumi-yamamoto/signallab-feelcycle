import { workoutInputSchema, workoutRecordSchema, type WorkoutInput } from "../types/workout.js";

export function normalizeWorkoutInput(input: WorkoutInput, createdAt: string) {
  const value = workoutInputSchema.parse(input);
  const date = value.date.replace(/\//g, "-");
  const studio = normalizeText(value.studio);
  const program = normalizeText(value.program);
  const instructorName = normalizeText(value.instructorName ?? "");
  const timeMatch = value.startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch?.[1] || !timeMatch[2]) {
    throw new Error(`Invalid time: ${value.startTime}`);
  }
  const startTime = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;

  return workoutRecordSchema.parse({
    id: `feelcycle:${date}:${startTime}:${normalizeKey(studio)}:${normalizeKey(program)}`,
    date,
    studio,
    program,
    instructorName,
    startTime,
    intensity: value.intensity?.trim() ?? "",
    subjectiveMemo: value.subjectiveMemo?.trim() ?? "",
    conditionMemo: value.conditionMemo?.trim() ?? "",
    createdAt
  });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
