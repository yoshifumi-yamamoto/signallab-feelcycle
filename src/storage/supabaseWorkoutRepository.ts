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
        raw_program_name: record.rawProgramName,
        lesson_kind: record.lessonKind,
        program_family: record.programFamily,
        program_series: record.programSeries,
        program_variant: record.programVariant,
        program_version: record.programVersion,
        parse_rule: record.parseRule,
        ticket_kind: record.ticketKind,
        is_special_ticket: record.isSpecialTicket,
        special_ticket_label: record.specialTicketLabel || null,
        event_name: record.eventName || null,
        event_notes: record.eventNotes || null,
        instructor_name: record.instructorName || null,
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

    await this.removeSupersededFeelcycleRows(records);
  }

  private async removeSupersededFeelcycleRows(records: WorkoutRecord[]): Promise<void> {
    const canonicalIdsByLesson = new Map(
      records.map((record) => [lessonKey(record.date, record.startTime, record.studio), record.id])
    );
    const rows: StoredWorkoutIdentity[] = [];

    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.client
        .from("feelcycle_workouts")
        .select("id,workout_date,start_time,studio")
        .like("id", "feelcycle:%")
        .range(from, from + 999);

      if (error) {
        throw error;
      }

      rows.push(...(data ?? []));
      if (!data || data.length < 1000) {
        break;
      }
    }

    const staleIds = rows
      .filter((row) => {
        const canonicalId = canonicalIdsByLesson.get(
          lessonKey(row.workout_date, row.start_time, row.studio)
        );
        return canonicalId !== undefined && row.id !== canonicalId;
      })
      .map((row) => row.id);

    for (const ids of chunk(staleIds, 100)) {
      const { error } = await this.client.from("feelcycle_workouts").delete().in("id", ids);
      if (error) {
        throw error;
      }
    }

    if (staleIds.length > 0) {
      console.info(`[feelcycle] removed ${staleIds.length} superseded duplicate records`);
    }
  }
}

interface StoredWorkoutIdentity {
  id: string;
  workout_date: string;
  start_time: string;
  studio: string;
}

function lessonKey(date: string, startTime: string, studio: string): string {
  return [
    date,
    startTime.slice(0, 5),
    studio.trim()
  ].join("\u0000");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
