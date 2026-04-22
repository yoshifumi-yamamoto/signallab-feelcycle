import { workoutInputSchema, workoutRecordSchema, type WorkoutInput } from "../types/workout.js";

export function normalizeWorkoutInput(input: WorkoutInput, createdAt: string) {
  const value = workoutInputSchema.parse(input);
  const date = value.date.replace(/\//g, "-");
  const timeMatch = value.startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch?.[1] || !timeMatch[2]) {
    throw new Error(`Invalid time: ${value.startTime}`);
  }
  const startTime = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;

  return workoutRecordSchema.parse({
    id: `feelcycle:${date}:${startTime}:${value.program.toLowerCase()}`,
    date,
    studio: value.studio.trim(),
    program: value.program.trim(),
    startTime,
    intensity: value.intensity?.trim() ?? "",
    subjectiveMemo: value.subjectiveMemo?.trim() ?? "",
    conditionMemo: value.conditionMemo?.trim() ?? "",
    createdAt
  });
}
