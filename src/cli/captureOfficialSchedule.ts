import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { createLoggedInContext } from "../feelcycle/auth/login.js";

interface ScheduleResponse {
  result_code?: number;
  shujiku_tab?: Array<{ id: number; name: string; code: string }>;
  lesson_list?: Array<{ lesson_date: string; schedule?: Array<{ lesson_name?: string; store_id?: number; store_name?: string; user_name_list?: Array<{ id?: number; name?: string }> }> }>;
}

async function captureAndWrite(): Promise<void> {
  const { browser, context, page } = await createLoggedInContext();
  const responses: ScheduleResponse[] = [];
  let selectedStores: Array<{ id: number; name: string; code: string }> = [];
  try {
    await page.goto(new URL(env.feelcycleLoginUrl).origin + "/reserve", { waitUntil: "domcontentloaded" });
    await page.locator("a[href='/reserve/search/studio']").click();
    await page.waitForURL("**/reserve/search/studio");
    await page.waitForTimeout(500);

    const headers = page.locator(".v-expansion-panel__header");
    const storeIds: number[] = [];
    for (let index = 1, count = await headers.count(); index < count; index += 1) {
      const body = page.locator(".v-expansion-panel__body").nth(index);
      if (!(await body.isVisible())) {
        await headers.nth(index).locator(".v-expansion-panel__header__icon").click();
        await body.waitFor({ state: "visible" });
      }
      const labels = body.locator("label.checkbox_wrap");
      for (let labelIndex = 0, labelCount = await labels.count(); labelIndex < labelCount; labelIndex += 1) {
        const value = await labels.nth(labelIndex).locator("input[value]").getAttribute("value");
        const storeId = Number.parseInt(value ?? "", 10);
        if (Number.isInteger(storeId) && !storeIds.includes(storeId)) storeIds.push(storeId);
      }
    }
    if (storeIds.length < 30) throw new Error(`Store discovery was incomplete: ${storeIds.length}`);

    const startingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    for (const storeId of storeIds) {
      const response = await fetchStoreSchedule(page, storeId, startingDate);
      responses.push(response);
    }
    selectedStores = responses.flatMap((response) => response.shujiku_tab ?? []);
    if (new Set(selectedStores.map((store) => store.id)).size !== storeIds.length) {
      throw new Error(`Store metadata was incomplete: expected ${storeIds.length}, received ${selectedStores.length}`);
    }

  } finally {
    await context.close();
    await browser.close();
  }

  // Per-store responses contain one tab; preserve the full selected master on the first row.
  if (responses[0]) responses[0].shujiku_tab = selectedStores;

  const lessons = responses.flatMap((response) => response.lesson_list ?? []).flatMap((day) => day.schedule ?? []);
  const storeIds = new Set(lessons.flatMap((lesson) => typeof lesson.store_id === "number" ? [lesson.store_id] : []));
  const instructorIds = new Set(lessons.flatMap((lesson) => lesson.user_name_list ?? []).flatMap((user) => typeof user.id === "number" ? [user.id] : []));
  const lessonNames = new Set(lessons.flatMap((lesson) => lesson.lesson_name?.trim() ? [lesson.lesson_name.trim()] : []));
  const expectedStores = new Set(selectedStores.map((store) => store.id));
  const summary = { responses: responses.length, expectedStores: expectedStores.size, stores: storeIds.size, lessons: lessons.length, lessonNames: lessonNames.size, instructors: instructorIds.size };
  // A selected store can legitimately have no published rows in the current window.
  if (expectedStores.size < 30 || responses.length !== expectedStores.size || storeIds.size < expectedStores.size - 1 || instructorIds.size < 30) throw new Error(`Incomplete capture: ${JSON.stringify(summary)}`);

  await fs.mkdir(path.resolve("data"), { recursive: true });
  await fs.writeFile(path.resolve("data", "feelcycle-official-schedule.json"), JSON.stringify({ capturedAt: new Date().toISOString(), summary, responses }, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

async function main(): Promise<void> {
  // Playwright response waiters alone do not keep Node's event loop alive on every runtime.
  const keepAlive = setInterval(() => undefined, 1000);
  try {
    await captureAndWrite();
  } finally {
    clearInterval(keepAlive);
  }
}

async function fetchStoreSchedule(page: import("playwright").Page, storeId: number, date: string): Promise<ScheduleResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.evaluate(async ({ requestedStoreId, startingDate }) => {
        const params = new URLSearchParams({ mode: "2", shujiku_type: "1", get_direction: "1", get_starting_date: startingDate, trial_lesson: "0" });
        params.append("search_store[]", String(requestedStoreId));
        const result = await fetch(`/api/reserve/lesson_calendar?${params.toString()}`);
        if (!result.ok) throw new Error(`Schedule API failed with ${result.status}`);
        return result.json();
      }, { requestedStoreId: storeId, startingDate: date }) as ScheduleResponse;
      if (response.result_code !== 0 || !response.lesson_list || response.shujiku_tab?.[0]?.id !== storeId) {
        throw new Error(`Invalid schedule response for store ${storeId}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(attempt * 500);
    }
  }
  throw lastError;
}

await main().catch((error) => { console.error(error); process.exitCode = 1; });
