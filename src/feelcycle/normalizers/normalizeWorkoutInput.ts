import { workoutInputSchema, workoutRecordSchema, type WorkoutInput } from "../types/workout.js";
import { classifyProgram, classifyTicket } from "./classifyProgram.js";

export function normalizeWorkoutInput(input: WorkoutInput, createdAt: string) {
  const value = workoutInputSchema.parse(input);
  const date = value.date.replace(/\//g, "-");
  const studio = normalizeText(value.studio);
  const program = normalizeText(value.program);
  const instructorName = normalizeText(value.instructorName ?? "");
  const ticket = classifyTicket(value.specialTicketLabel ?? value.ticketKind ?? "");
  const classification = classifyProgram(program);
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
    rawProgramName: program,
    lessonKind: classification.lessonKind,
    programFamily: classification.programFamily,
    programSeries: classification.programSeries,
    programVariant: classification.programVariant,
    programVersion: classification.programVersion,
    parseRule: classification.parseRule,
    ticketKind: ticket.ticketKind,
    isSpecialTicket: ticket.isSpecialTicket,
    specialTicketLabel: ticket.specialTicketLabel,
    eventName: "",
    eventNotes: "",
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
