import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env.js";

interface WorkoutRow {
  workout_date: string;
  program: string;
  instructor_name: string | null;
  lesson_kind: string;
  program_family: string;
  program_series: string | null;
  program_variant: string | null;
  program_version: number | null;
  parse_rule: string;
  created_at: string;
  updated_at: string;
}

interface LessonSeed {
  id: string;
  lesson_name: string;
  lesson_kind: string;
  program_family: string;
  program_series: string | null;
  program_variant: string | null;
  program_version: number | null;
  parse_rule: string;
  source: string;
  first_observed_at: string;
  last_observed_at: string;
  updated_at: string;
}

interface InstructorSeed {
  id: string;
  instructor_name: string;
  first_observed_at: string;
  last_observed_at: string;
  updated_at: string;
}

interface AssignmentSeed {
  lesson_id: string;
  instructor_id: string;
  source: string;
  first_observed_at: string;
  last_observed_at: string;
  observed_count: number;
  updated_at: string;
}

export class SupabaseLessonMasterRepository {
  private readonly client = (() => {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }

    return createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  })();

  async syncFromWorkoutHistory(): Promise<{ lessons: number; instructors: number; assignments: number }> {
    const workouts = await this.loadWorkoutHistory();
    const now = new Date().toISOString();
    const lessons = new Map<string, LessonSeed>();
    const instructors = new Map<string, InstructorSeed>();
    const assignments = new Map<string, AssignmentSeed>();

    for (const workout of workouts) {
      const lessonId = createStableId("lesson", workout.program);
      const observedAt = workout.updated_at || workout.created_at || `${workout.workout_date}T00:00:00.000Z`;
      const existingLesson = lessons.get(lessonId);
      lessons.set(lessonId, {
        id: lessonId,
        lesson_name: workout.program,
        lesson_kind: workout.lesson_kind,
        program_family: workout.program_family,
        program_series: workout.program_series,
        program_variant: workout.program_variant,
        program_version: workout.program_version,
        parse_rule: workout.parse_rule,
        source: "workout_history",
        first_observed_at: earliest(existingLesson?.first_observed_at, observedAt),
        last_observed_at: latest(existingLesson?.last_observed_at, observedAt),
        updated_at: now
      });

      const instructorName = workout.instructor_name?.trim();
      if (!instructorName) {
        continue;
      }

      const instructorId = createStableId("instructor", instructorName);
      const existingInstructor = instructors.get(instructorId);
      instructors.set(instructorId, {
        id: instructorId,
        instructor_name: instructorName,
        first_observed_at: earliest(existingInstructor?.first_observed_at, observedAt),
        last_observed_at: latest(existingInstructor?.last_observed_at, observedAt),
        updated_at: now
      });

      const assignmentId = `${lessonId}\u0000${instructorId}`;
      const existingAssignment = assignments.get(assignmentId);
      assignments.set(assignmentId, {
        lesson_id: lessonId,
        instructor_id: instructorId,
        source: "workout_history",
        first_observed_at: earliest(existingAssignment?.first_observed_at, observedAt),
        last_observed_at: latest(existingAssignment?.last_observed_at, observedAt),
        observed_count: (existingAssignment?.observed_count ?? 0) + 1,
        updated_at: now
      });
    }

    await this.upsert("feelcycle_lessons", [...lessons.values()], "id");
    await this.upsert("feelcycle_instructors", [...instructors.values()], "id");
    await this.upsert("feelcycle_lesson_instructors", [...assignments.values()], "lesson_id,instructor_id");

    return {
      lessons: lessons.size,
      instructors: instructors.size,
      assignments: assignments.size
    };
  }

  private async loadWorkoutHistory(): Promise<WorkoutRow[]> {
    const rows: WorkoutRow[] = [];

    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.client
        .from("feelcycle_workouts")
        .select("workout_date,program,instructor_name,lesson_kind,program_family,program_series,program_variant,program_version,parse_rule,created_at,updated_at")
        .like("id", "feelcycle:%")
        .range(from, from + 999);

      if (error) {
        throw error;
      }

      rows.push(...((data ?? []) as WorkoutRow[]));
      if (!data || data.length < 1000) {
        return rows;
      }
    }
  }

  private async upsert<T extends object>(table: string, rows: T[], onConflict: string): Promise<void> {
    for (const batch of chunk(rows, 250)) {
      const { error } = await this.client.from(table).upsert(batch as Record<string, unknown>[], { onConflict });
      if (error) {
        throw error;
      }
    }
  }
}

function createStableId(type: string, value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim().toUpperCase();
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 24);
  return `feelcycle:${type}:${digest}`;
}

function earliest(left: string | undefined, right: string): string {
  return !left || right < left ? right : left;
}

function latest(left: string | undefined, right: string): string {
  return !left || right > left ? right : left;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
