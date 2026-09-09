import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";
import { createLoggedInContext } from "../feelcycle/auth/login.js";

interface Store {
  id: number;
  name: string;
  code: string;
}

interface ScheduleResponse {
  result_code?: number;
  shujiku_tab?: Store[];
  lesson_list?: Array<{ lesson_date: string; schedule?: unknown[] }>;
}

interface CurrentScheduleFile {
  responses: Array<{ shujiku_tab?: Store[] }>;
}

async function main(): Promise<void> {
  const storeId = Number.parseInt(process.argv[2] ?? "", 10);
  const from = process.argv[3] ?? fiveYearsAgo();
  if (!Number.isInteger(storeId)) throw new Error("Usage: captureOfficialScheduleStore <store-id> [YYYY-MM-DD]");

  const current = JSON.parse(await fs.readFile(path.resolve("data", "feelcycle-official-schedule.json"), "utf8")) as CurrentScheduleFile;
  const stores = current.responses[0]?.shujiku_tab ?? [];
  const store = stores.find((item) => item.id === storeId);
  if (!store) throw new Error(`Unknown store id: ${storeId}`);

  const { browser, context, page } = await createLoggedInContext();
  let body: ScheduleResponse;
  try {
    await page.goto(new URL(env.feelcycleLoginUrl).origin + "/reserve", { waitUntil: "networkidle" });
    const params = new URLSearchParams({ mode: "2", shujiku_type: "1", get_direction: "1", get_starting_date: from, trial_lesson: "0" });
    params.append("search_store[]", String(storeId));
    const apiPage = await context.newPage();
    await apiPage.goto(`${new URL(env.feelcycleLoginUrl).origin}/api/reserve/lesson_calendar?${params.toString()}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    body = JSON.parse(await apiPage.locator("body").innerText()) as ScheduleResponse;
    await apiPage.close();
  } finally {
    await context.close();
    await browser.close();
  }

  const days = body.lesson_list ?? [];
  const slots = days.reduce((sum, day) => sum + (day.schedule?.length ?? 0), 0);
  if (body.result_code !== 0 || days.length < 1700 || !days[0]?.lesson_date || slots === 0) {
    throw new Error(`Incomplete history for ${store.code}: ${JSON.stringify({ days: days.length, slots, resultCode: body.result_code })}`);
  }
  body.shujiku_tab = [store];
  const capturedAt = new Date().toISOString();
  const summary = { store, from: days[0].lesson_date, to: days.at(-1)?.lesson_date, days: days.length, slots };
  const outputDir = path.resolve("data", "feelcycle-official-history");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `store-${store.id}.json`), JSON.stringify({ capturedAt, summary, responses: [body] }), "utf8");
  console.log(JSON.stringify(summary));
}

function fiveYearsAgo(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${Number(values.year) - 5}-${values.month}-${values.day}`;
}

await main().catch((error) => { console.error(error); process.exitCode = 1; });
