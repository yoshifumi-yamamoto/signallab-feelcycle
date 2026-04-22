import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env.js";
import type { WorkoutRecord } from "../feelcycle/types/workout.js";

export class SupabaseWorkoutRepository {
  private readonly client = (() => {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }

    return createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  })();

  async saveMany(records: WorkoutRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const importedAt = new Date().toISOString();
    const { error } = await this.client.from("feelcycle_workouts").upsert(
      records.map((record) => ({
        id: record.id,
        workout_date: record.date,
        studio: record.studio,
        program: record.program,
        start_time: record.startTime,
        intensity: record.intensity || null,
        subjective_memo: record.subjectiveMemo,
        condition_memo: record.conditionMemo,
        created_at: record.createdAt,
        updated_at: importedAt
      })),
      {
        onConflict: "id"
      }
    );

    if (error) {
      throw error;
    }
  }
}
