import { env } from "../../config/env.js";
import { createLoggedInContext } from "../auth/login.js";

export interface MonthlyHistorySnapshot {
  monthLabel: string;
  html: string;
}

interface LessonHistoryResponse {
  result_code?: number;
  error_messages?: string;
  [month: string]: LessonHistoryMonth | number | string | undefined;
}

interface LessonHistoryMonth {
  lesson_info?: LessonHistoryEntry[];
}

interface LessonHistoryEntry {
  shift_date?: unknown;
  ls_st?: unknown;
  store_name?: unknown;
  program_search?: unknown;
  instructor_name_list?: unknown;
  iname?: unknown;
  ticket_name?: unknown;
}

export async function fetchMyPageWorkouts(): Promise<MonthlyHistorySnapshot[]> {
  const { browser, context, page } = await createLoggedInContext();

  try {
    await openMyPage(page);
    return await collectHistoryPages(page, env.feelcycleHistoryMonths);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function openMyPage(page: import("playwright").Page): Promise<void> {
  const myPageUrl = getMyPageUrl();
  if (page.url() !== myPageUrl) {
    console.info("[feelcycle] opening my page");
    await page.goto(myPageUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  }

  await waitForMyPageReady(page);
}

async function collectHistoryPages(
  page: import("playwright").Page,
  maxMonths: number
): Promise<MonthlyHistorySnapshot[]> {
  const snapshots: MonthlyHistorySnapshot[] = [];
  const seenMonths = new Set<string>();
  const targetMonth = new Date();
  targetMonth.setDate(1);

  while (snapshots.length < maxMonths) {
    const requestedMonth = formatMonthKey(targetMonth);
    const response = await loadLessonHistory(page, requestedMonth);
    const months = Object.keys(response)
      .filter((key) => /^\d{6}$/.test(key))
      .sort((left, right) => right.localeCompare(left));

    if (months.length === 0) {
      throw new Error(`FEELCYCLE lesson history returned no month data for ${requestedMonth}`);
    }

    for (const month of months) {
      if (seenMonths.has(month) || snapshots.length >= maxMonths) {
        continue;
      }

      const monthData = response[month] as LessonHistoryMonth | undefined;
      const records = monthData?.lesson_info ?? [];
      seenMonths.add(month);
      snapshots.push({
        monthLabel: formatMonthLabel(month),
        html: renderHistoryHtml(records)
      });
      console.info(`[feelcycle] captured month ${snapshots.length}: ${formatMonthLabel(month)} (${records.length} records)`);
    }

    targetMonth.setMonth(targetMonth.getMonth() - 1);
  }

  return snapshots;
}

async function loadLessonHistory(
  page: import("playwright").Page,
  targetMonth: string
): Promise<LessonHistoryResponse> {
  const response = await page.evaluate(async (month) => {
    const documentRef = (globalThis as any).document;
    const csrfToken = documentRef.querySelector("meta[name='csrf-token']")?.getAttribute("content") ?? "";
    const result = await fetch("/api/auth/user/lesson_hist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrfToken,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify({ target_ym: month })
    });

    return {
      status: result.status,
      body: await result.json()
    };
  }, targetMonth);

  const body = response.body as LessonHistoryResponse;
  if (response.status !== 200 || body.result_code !== 0) {
    throw new Error(`FEELCYCLE lesson history request failed for ${targetMonth}: ${JSON.stringify({
      status: response.status,
      resultCode: body.result_code,
      error: body.error_messages
    })}`);
  }

  return body;
}

function getMyPageUrl(): string {
  const url = new URL(env.feelcycleHistoryUrl ?? env.feelcycleLoginUrl);
  url.pathname = "/mypage";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function waitForMyPageReady(page: import("playwright").Page): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await page.evaluate(() => {
      const documentRef = (globalThis as any).document;
      return Boolean(documentRef.querySelector("meta[name='csrf-token']"));
    }).catch(() => false);
    if (ready) {
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`FEELCYCLE my page did not become ready: ${page.url()}`);
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number.parseInt(month.slice(4), 10)}月`;
}

function renderHistoryHtml(records: LessonHistoryEntry[]): string {
  return records.map((record) => {
    const instructor = toText(record.instructor_name_list ?? record.iname);

    return [
      '<div class="box_wrap box-4">',
      `<div class="text_bold_500">${escapeHtml(toText(record.shift_date))}</div>`,
      `<div class="text_bold_500 mb05">${escapeHtml(toText(record.ls_st))}</div>`,
      `<div class="underline">${escapeHtml(toText(record.program_search))}</div>`,
      `<div class="instructor">${escapeHtml(instructor)}</div>`,
      `<div class="tenpo">＠${escapeHtml(toText(record.store_name))}</div>`,
      `<div class="ticket_type">${escapeHtml(toText(record.ticket_name))}</div>`,
      "</div>"
    ].join("");
  }).join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function toText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(" ");
  }

  if (value && typeof value === "object") {
    return Object.values(value).map(toText).filter(Boolean).join(" ");
  }

  return "";
}
