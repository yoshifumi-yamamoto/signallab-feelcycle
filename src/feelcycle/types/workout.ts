import { z } from "zod";

export const workoutInputSchema = z.object({
  date: z.string().min(1),
  studio: z.string().min(1),
  program: z.string().min(1),
  instructorName: z.string().optional().default(""),
  startTime: z.string().min(1),
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
  intensity: z.string().default(""),
  subjectiveMemo: z.string().default(""),
  conditionMemo: z.string().default(""),
  createdAt: z.string().datetime({ offset: true })
});

export type WorkoutInput = z.infer<typeof workoutInputSchema>;
export type WorkoutRecord = z.infer<typeof workoutRecordSchema>;
