import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env.js";
import { classifyProgram } from "../feelcycle/normalizers/classifyProgram.js";

interface ScheduleFile {
  capturedAt: string;
  responses: Array<{
    shujiku_tab?: Array<{ id: number; name: string; code?: string }>;
    lesson_list?: Array<{
      lesson_date: string;
      schedule?: Array<{
        sid_hash?: string;
        lesson_name?: string;
        lesson_start?: string;
        lesson_end?: string;
        status?: number;
        store_id?: number;
        store_name?: string;
        user_name_list?: Array<{ id?: number; name?: string }>;
      }>;
    }>;
  }>;
}

interface InstructorFile {
  capturedAt: string;
  instructors: Array<{ uid: number; name: string; path_img?: string; store_list?: Array<{ store_name: string }> }>;
}

async function main(): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new Error("Supabase environment variables are required");
  const sourcePath = path.resolve(process.argv[2] ?? "data/feelcycle-official-schedule.json");
  const source = JSON.parse(await fs.readFile(sourcePath, "utf8")) as ScheduleFile;
  const instructorPath = path.resolve(process.argv[3] ?? "data/feelcycle-official-instructors.json");
  const instructorSource = JSON.parse(await fs.readFile(instructorPath, "utf8")) as InstructorFile;
  const lessons = new Map<string, Record<string, unknown>>();
  const instructors = new Map<string, Record<string, unknown>>();
  const studios = new Map<number, Record<string, unknown>>();
  const occurrences = new Map<string, Record<string, unknown>>();
  const instructorStudios = new Map<string, Record<string, unknown>>();

  for (const studio of source.responses[0]?.shujiku_tab ?? []) {
    studios.set(studio.id, {
      id: studio.id,
      studio_name: studio.name,
      studio_code: studio.code ?? null,
      first_observed_at: source.capturedAt,
      last_observed_at: source.capturedAt,
      updated_at: source.capturedAt
    });
  }

  for (const response of source.responses) {
    for (const day of response.lesson_list ?? []) {
      const observedAt = `${day.lesson_date.slice(0, 4)}-${day.lesson_date.slice(4, 6)}-${day.lesson_date.slice(6, 8)}T00:00:00+09:00`;
      for (const schedule of day.schedule ?? []) {
        const lessonName = schedule.lesson_name?.replace(/\s+/g, " ").trim();
        if (!lessonName || !schedule.sid_hash || typeof schedule.store_id !== "number" || !schedule.store_name) continue;
        const lessonId = stableId("lesson", lessonName);
        const classification = classifyProgram(lessonName);
        const existingLesson = lessons.get(lessonId);
        lessons.set(lessonId, {
          id: lessonId, lesson_name: lessonName, lesson_kind: classification.lessonKind,
          program_family: classification.programFamily, program_series: classification.programSeries,
          program_variant: classification.programVariant, program_version: classification.programVersion,
          parse_rule: classification.parseRule, source: "official_schedule",
          first_observed_at: earliest(existingLesson?.first_observed_at, observedAt),
          last_observed_at: latest(existingLesson?.last_observed_at, observedAt), updated_at: source.capturedAt
        });
        const studio = parseStudio(schedule.store_name);
        const existingStudio = studios.get(schedule.store_id);
        studios.set(schedule.store_id, {
          id: schedule.store_id, studio_name: studio.name, studio_code: studio.code,
          first_observed_at: earliest(existingStudio?.first_observed_at, observedAt),
          last_observed_at: latest(existingStudio?.last_observed_at, observedAt), updated_at: source.capturedAt
        });
        for (const user of schedule.user_name_list ?? []) {
          const name = user.name?.trim();
          if (!name) continue;
          const instructorId = stableId("instructor", name);
          const existingInstructor = instructors.get(instructorId);
          instructors.set(instructorId, {
            id: instructorId, official_id: user.id ?? null, instructor_name: name,
            first_observed_at: earliest(existingInstructor?.first_observed_at, observedAt),
            last_observed_at: latest(existingInstructor?.last_observed_at, observedAt), updated_at: source.capturedAt
          });
          const key = `${schedule.sid_hash}\u0000${instructorId}`;
          occurrences.set(key, {
            schedule_id: schedule.sid_hash, instructor_id: instructorId, official_instructor_id: user.id ?? null,
            lesson_id: lessonId, store_id: schedule.store_id,
            lesson_date: observedAt.slice(0, 10), lesson_start: schedule.lesson_start ?? null,
            lesson_end: schedule.lesson_end ?? null, status: schedule.status ?? null,
            captured_at: source.capturedAt, updated_at: source.capturedAt
          });
        }
      }
    }
  }

  const studioByCode = new Map([...studios.entries()].map(([id, row]) => [String(row.studio_code), id]));
  for (const official of instructorSource.instructors) {
    const name = official.name.trim();
    if (!name) continue;
    const instructorId = stableId("instructor", name);
    const existing = instructors.get(instructorId);
    instructors.set(instructorId, {
      id: instructorId,
      official_id: official.uid,
      instructor_name: name,
      profile_image_url: official.path_img ?? null,
      first_observed_at: earliest(existing?.first_observed_at, instructorSource.capturedAt),
      last_observed_at: latest(existing?.last_observed_at, instructorSource.capturedAt),
      updated_at: instructorSource.capturedAt
    });
    for (const listedStudio of official.store_list ?? []) {
      const parsed = parseStudio(listedStudio.store_name);
      const storeId = parsed.code ? studioByCode.get(parsed.code) : undefined;
      if (storeId === undefined) continue;
      instructorStudios.set(`${instructorId}\u0000${storeId}`, {
        instructor_id: instructorId,
        store_id: storeId,
        first_observed_at: instructorSource.capturedAt,
        last_observed_at: instructorSource.capturedAt,
        updated_at: instructorSource.capturedAt
      });
    }
  }

  const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const mergeObservationDates = async (table: string, rows: Map<string, Record<string, unknown>>) => {
    const { data, error } = await client.from(table).select("id,first_observed_at,last_observed_at");
    if (error) throw error;
    for (const existing of data ?? []) {
      const row = rows.get(String(existing.id));
      if (!row) continue;
      row.first_observed_at = [String(row.first_observed_at), String(existing.first_observed_at)].sort()[0];
      row.last_observed_at = [String(row.last_observed_at), String(existing.last_observed_at)].sort().at(-1);
    }
  };
  const upsert = async (table: string, rows: Record<string, unknown>[], onConflict: string) => {
    for (let index = 0; index < rows.length; index += 250) {
      const { error } = await client.from(table).upsert(rows.slice(index, index + 250), { onConflict });
      if (error) throw error;
    }
  };

  await mergeObservationDates("feelcycle_lessons", lessons);
  await mergeObservationDates("feelcycle_instructors", instructors);
  await upsert("feelcycle_studios", [...studios.values()], "id");
  await upsert("feelcycle_lessons", [...lessons.values()], "id");
  await upsert("feelcycle_instructors", [...instructors.values()], "id");
  await upsert("feelcycle_instructor_studios", [...instructorStudios.values()], "instructor_id,store_id");
  await upsert("feelcycle_schedule_occurrences", [...occurrences.values()], "schedule_id,instructor_id");
  console.log(JSON.stringify({ studios: studios.size, lessons: lessons.size, instructors: instructors.size, instructorStudios: instructorStudios.size, occurrences: occurrences.size }, null, 2));
}

function stableId(type: string, value: string): string {
  return `feelcycle:${type}:${createHash("sha256").update(value.replace(/\s+/g, " ").trim().toUpperCase()).digest("hex").slice(0, 24)}`;
}

function earliest(value: unknown, next: string): string {
  return typeof value === "string" && value < next ? value : next;
}

function latest(value: unknown, next: string): string {
  return typeof value === "string" && value > next ? value : next;
}

function parseStudio(value: string): { name: string; code: string | null } {
  const match = value.match(/^(.*?)（([^）]+)）$/);
  return { name: match?.[1]?.trim() ?? value.trim(), code: match?.[2]?.trim() ?? null };
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
