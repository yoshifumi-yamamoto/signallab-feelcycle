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
    for (let index = 1, count = await headers.count(); index < count; index += 1) {
      await headers.nth(index).locator(".v-expansion-panel__header__icon").click();
      await page.locator(".v-expansion-panel__body").nth(index).waitFor({ state: "visible" });
      const labels = page.locator(".v-expansion-panel__body").nth(index).locator("label.checkbox_wrap");
      for (let labelIndex = 0, labelCount = await labels.count(); labelIndex < labelCount; labelIndex += 1) {
        const label = labels.nth(labelIndex);
        if (!(await label.locator("input[value]").isChecked())) await label.click();
      }
    }

    let selectedResponse: ScheduleResponse | undefined;
    page.on("response", async (response) => {
      if (isScheduleResponse(response)) selectedResponse = await readScheduleResponse(response);
    });
    await page.locator(".btn.complete").evaluate((node) => (node as unknown as { click(): void }).click());
    await page.waitForTimeout(3000);
    selectedStores = selectedResponse?.shujiku_tab ?? [];
    if (selectedStores.length < 30) throw new Error(`Store selection was incomplete: ${selectedStores.length}`);

    const startingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    for (const store of selectedStores) {
      const response = await page.evaluate(async ({ storeId, date }) => {
        const params = new URLSearchParams({ mode: "2", shujiku_type: "1", get_direction: "1", get_starting_date: date, trial_lesson: "0" });
        params.append("search_store[]", String(storeId));
        const result = await fetch(`/api/reserve/lesson_calendar?${params.toString()}`);
        if (!result.ok) throw new Error(`Schedule API failed with ${result.status}`);
        return result.json();
      }, { storeId: store.id, date: startingDate }) as ScheduleResponse;
      responses.push(response);
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

function isScheduleResponse(response: import("playwright").Response): boolean {
  return response.url().includes("/api/reserve/lesson_calendar") && response.status() === 200;
}

async function readScheduleResponse(response: import("playwright").Response): Promise<ScheduleResponse> {
  const body = await response.json() as ScheduleResponse;
  if (body.result_code !== 0 || !body.lesson_list) throw new Error(`Invalid schedule response from ${response.url()}`);
  return body;
}

await main().catch((error) => { console.error(error); process.exitCode = 1; });
