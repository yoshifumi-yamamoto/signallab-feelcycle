import { z } from "zod";

export const workoutInputSchema = z.object({
  date: z.string().min(1),
  studio: z.string().min(1),
  program: z.string().min(1),
  instructorName: z.string().optional().default(""),
  startTime: z.string().min(1),
  ticketKind: z.string().optional().default("regular"),
  specialTicketLabel: z.string().optional().default(""),
  intensity: z.string().optional().default(""),
  subjectiveMemo: z.string().optional().default(""),
  conditionMemo: z.string().optional().default("")
});

export const workoutRecordSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studio: z.string().min(1),
  program: z.string().min(1),
  instructorName: z.string().default(""),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  rawProgramName: z.string().min(1),
  lessonKind: z.string().min(1),
  programFamily: z.string().min(1),
  programSeries: z.string().optional().nullable(),
  programVariant: z.string().optional().nullable(),
  programVersion: z.number().int().optional().nullable(),
  parseRule: z.string().min(1),
  ticketKind: z.string().min(1),
  isSpecialTicket: z.boolean(),
  specialTicketLabel: z.string().default(""),
  eventName: z.string().default(""),
  eventNotes: z.string().default(""),
  intensity: z.string().default(""),
  subjectiveMemo: z.string().default(""),
  conditionMemo: z.string().default(""),
  createdAt: z.string().datetime({ offset: true })
});

export type WorkoutInput = z.input<typeof workoutInputSchema>;
export type WorkoutRecord = z.infer<typeof workoutRecordSchema>;
