import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env.js";

interface HistoryFile {
  responses: Array<{ lesson_list?: Array<{ lesson_date: string; schedule?: Schedule[] }> }>;
}

interface Schedule {
  sid_hash?: string;
  lesson_name?: string;
  lesson_start?: string;
  store_id?: number;
  user_name_list?: Array<{ name?: string }>;
}

interface LedgerEntry {
  schedule_id: string;
  instructor_id: string;
  lesson_id: string;
  store_id: number;
  lesson_date: string;
  lesson_start: string | null;
}

async function main(): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new Error("Supabase environment variables are required");
  const directory = path.resolve(process.argv[2] ?? "data/feelcycle-official-history");
  const from = process.argv[3] ?? "2026-09-09";
  const to = process.argv[4] ?? "2026-09-25";
  const files = (await fs.readdir(directory)).filter((file) => /^store-\d+\.json$/.test(file)).sort();
  if (files.length !== 36) throw new Error(`Expected 36 history files, found ${files.length}`);

  const entries = new Map<string, LedgerEntry>();
  for (const file of files) {
    const source = JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as HistoryFile;
    for (const response of source.responses) {
      for (const day of response.lesson_list ?? []) {
        const date = formatDate(day.lesson_date);
        if (date < from || date > to) continue;
        for (const schedule of day.schedule ?? []) {
          const lessonName = schedule.lesson_name?.replace(/\s+/g, " ").trim();
          if (!schedule.sid_hash || !lessonName || typeof schedule.store_id !== "number") continue;
          for (const user of schedule.user_name_list ?? []) {
            const name = user.name?.trim();
            if (!name) continue;
            const instructorId = stableId("instructor", name);
            const entry = {
              schedule_id: schedule.sid_hash,
              instructor_id: instructorId,
              lesson_id: stableId("lesson", lessonName),
              store_id: schedule.store_id,
              lesson_date: date,
              lesson_start: schedule.lesson_start ?? null
            };
            entries.set(`${entry.schedule_id}\u0000${entry.instructor_id}`, entry);
          }
        }
      }
    }
  }

  const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  let registered = 0;
  let corrected = 0;
  let skipped = 0;
  const rows = [...entries.values()];
  for (let index = 0; index < rows.length; index += 250) {
    const { data, error } = await client.rpc("register_feelcycle_history_baseline_occurrences", { entries: rows.slice(index, index + 250) });
    if (error) throw error;
    const result = data as { registered?: number; corrected?: number; skipped?: number } | null;
    registered += result?.registered ?? 0;
    corrected += result?.corrected ?? 0;
    skipped += result?.skipped ?? 0;
  }
  console.log(JSON.stringify({ files: files.length, from, to, entries: rows.length, registered, corrected, skipped }, null, 2));
}

function formatDate(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function stableId(type: string, value: string): string {
  return `feelcycle:${type}:${createHash("sha256").update(value.replace(/\s+/g, " ").trim().toUpperCase()).digest("hex").slice(0, 24)}`;
}

await main().catch((error) => { console.error(error); process.exitCode = 1; });

