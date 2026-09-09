import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env.js";
import { classifyProgram } from "../feelcycle/normalizers/classifyProgram.js";

interface HistoryFile {
  capturedAt: string;
  responses: Array<{ lesson_list?: Array<{ lesson_date: string; schedule?: Schedule[] }> }>;
}

interface Schedule {
  lesson_name?: string;
  store_id?: number;
  user_name_list?: Array<{ id?: number; name?: string }>;
}

interface Aggregate {
  lesson_id: string;
  instructor_id: string;
  store_id?: number;
  first: string;
  last: string;
  count: number;
}

async function main(): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new Error("Supabase environment variables are required");
  const directory = path.resolve(process.argv[2] ?? "data/feelcycle-official-history");
  const files = (await fs.readdir(directory)).filter((file) => /^store-\d+\.json$/.test(file)).sort();
  if (files.length !== 36) throw new Error(`Expected 36 history files, found ${files.length}`);

  const lessons = new Map<string, Record<string, unknown>>();
  const instructors = new Map<string, Record<string, unknown>>();
  const instructorAssignments = new Map<string, Aggregate>();
  const studioAssignments = new Map<string, Aggregate>();
  let slots = 0;

  for (const file of files) {
    const source = JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as HistoryFile;
    for (const response of source.responses) {
      for (const day of response.lesson_list ?? []) {
        const date = `${day.lesson_date.slice(0, 4)}-${day.lesson_date.slice(4, 6)}-${day.lesson_date.slice(6, 8)}`;
        const observedAt = `${date}T00:00:00+09:00`;
        for (const schedule of day.schedule ?? []) {
          slots += 1;
          const lessonName = schedule.lesson_name?.replace(/\s+/g, " ").trim();
          if (!lessonName || typeof schedule.store_id !== "number") continue;
          const lessonId = stableId("lesson", lessonName);
          const classification = classifyProgram(lessonName);
          const currentLesson = lessons.get(lessonId);
          lessons.set(lessonId, {
            id: lessonId,
            lesson_name: lessonName,
            lesson_kind: classification.lessonKind,
            program_family: classification.programFamily,
            program_series: classification.programSeries,
            program_variant: classification.programVariant,
            program_version: classification.programVersion,
            parse_rule: classification.parseRule,
            source: "official_schedule_history",
            first_observed_at: earliest(currentLesson?.first_observed_at, observedAt),
            last_observed_at: latest(currentLesson?.last_observed_at, observedAt),
            updated_at: source.capturedAt
          });
          for (const user of schedule.user_name_list ?? []) {
            const name = user.name?.trim();
            if (!name) continue;
            const instructorId = stableId("instructor", name);
            const currentInstructor = instructors.get(instructorId);
            instructors.set(instructorId, {
              id: instructorId,
              official_id: user.id ?? null,
              instructor_name: name,
              first_observed_at: earliest(currentInstructor?.first_observed_at, observedAt),
              last_observed_at: latest(currentInstructor?.last_observed_at, observedAt),
              updated_at: source.capturedAt
            });
            addAggregate(instructorAssignments, `${lessonId}\u0000${instructorId}`, lessonId, instructorId, undefined, date);
            addAggregate(studioAssignments, `${lessonId}\u0000${instructorId}\u0000${schedule.store_id}`, lessonId, instructorId, schedule.store_id, date);
          }
        }
      }
    }
  }

  const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const mergeObservationDates = async (table: string, rows: Map<string, Record<string, unknown>>) => {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from(table).select("id,first_observed_at,last_observed_at").range(from, from + 999);
      if (error) throw error;
      for (const existing of data ?? []) {
        const row = rows.get(String(existing.id));
        if (!row) continue;
        row.first_observed_at = earliest(row.first_observed_at, String(existing.first_observed_at));
        row.last_observed_at = latest(row.last_observed_at, String(existing.last_observed_at));
      }
      if ((data ?? []).length < 1000) break;
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
  await upsert("feelcycle_lessons", [...lessons.values()], "id");
  await upsert("feelcycle_instructors", [...instructors.values()], "id");
  await upsert("feelcycle_lesson_instructors", [...instructorAssignments.values()].map((item) => ({
    lesson_id: item.lesson_id,
    instructor_id: item.instructor_id,
    source: "official_schedule_history",
    first_observed_at: `${item.first}T00:00:00+09:00`,
    last_observed_at: `${item.last}T00:00:00+09:00`,
    observed_count: item.count,
    updated_at: new Date().toISOString()
  })), "lesson_id,instructor_id");
  await upsert("feelcycle_lesson_instructor_studios", [...studioAssignments.values()].map((item) => ({
    lesson_id: item.lesson_id,
    instructor_id: item.instructor_id,
    store_id: item.store_id,
    first_taught_on: item.first,
    last_taught_on: item.last,
    occurrence_count: item.count,
    source: "official_schedule_history",
    updated_at: new Date().toISOString()
  })), "lesson_id,instructor_id,store_id");

  console.log(JSON.stringify({ files: files.length, slots, lessons: lessons.size, instructors: instructors.size, instructorAssignments: instructorAssignments.size, studioAssignments: studioAssignments.size }, null, 2));
}

function addAggregate(target: Map<string, Aggregate>, key: string, lessonId: string, instructorId: string, storeId: number | undefined, date: string): void {
  const current = target.get(key);
  target.set(key, {
    lesson_id: lessonId,
    instructor_id: instructorId,
    store_id: storeId,
    first: current && current.first < date ? current.first : date,
    last: current && current.last > date ? current.last : date,
    count: (current?.count ?? 0) + 1
  });
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

await main().catch((error) => { console.error(error); process.exitCode = 1; });
