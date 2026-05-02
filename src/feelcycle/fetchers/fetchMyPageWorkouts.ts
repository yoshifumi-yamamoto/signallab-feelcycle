import { env } from "../../config/env.js";
import { createLoggedInContext } from "../auth/login.js";

export interface MonthlyHistorySnapshot {
  monthLabel: string;
  html: string;
}

interface HistoryViewState {
  monthLabel: string;
  firstRowKey: string;
  recordCount: number;
}

export async function fetchMyPageWorkouts(): Promise<MonthlyHistorySnapshot[]> {
  if (!env.feelcycleHistoryUrl) {
    throw new Error("FEELCYCLE_HISTORY_URL is required");
  }

  const { browser, context, page } = await createLoggedInContext();

  try {
    await openHistoryPage(page);
    await openHistoryTab(page);
    return await collectHistoryPages(page, env.feelcycleHistoryMonths);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function openHistoryPage(page: import("playwright").Page): Promise<void> {
  const currentUrl = page.url();
  if (currentUrl.startsWith(env.feelcycleHistoryUrl)) {
    console.info("[feelcycle] already on history host page");
    return;
  }

  console.info("[feelcycle] opening history page");
  await page.goto(env.feelcycleHistoryUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => undefined);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
}

async function openHistoryTab(page: import("playwright").Page): Promise<void> {
  const historyTab = page.locator("ul.toggleTab2 > li").nth(1);
  if ((await historyTab.count()) === 0) {
    return;
  }

  const classes = (await historyTab.getAttribute("class").catch(() => "")) ?? "";
  if (classes.includes("active")) {
    console.info("[feelcycle] history tab already active");
    return;
  }

  console.info("[feelcycle] switching to history tab");
  await historyTab.click().catch(() => undefined);
  await waitForHistoryTabActivation(page);
  await page.waitForTimeout(1200);
}

async function collectHistoryPages(
  page: import("playwright").Page,
  maxMonths: number
): Promise<MonthlyHistorySnapshot[]> {
  const snapshots: MonthlyHistorySnapshot[] = [];
  const seenMonths = new Set<string>();

  for (let index = 0; index < maxMonths; index += 1) {
    await expandAllHistoryRows(page);
    const state = await readCurrentState(page);
    const monthLabel = state.monthLabel;
    console.info(`[feelcycle] captured month ${index + 1}: ${monthLabel}`);
    if (seenMonths.has(monthLabel)) {
      break;
    }

    seenMonths.add(monthLabel);
    snapshots.push({
      monthLabel,
      html: await page.content()
    });

    if (state.recordCount === 0) {
      console.info("[feelcycle] reached empty month, stopping history traversal");
      break;
    }

    const moved = await goToPreviousMonth(page, state);
    if (!moved) {
      console.info("[feelcycle] no older month available");
      break;
    }
  }

  return snapshots;
}

async function expandAllHistoryRows(page: import("playwright").Page): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const moreButton = page
      .locator(".btn_show_all .btn__primary, .btn_show_all")
      .filter({ hasText: "さらに表示する" })
      .first();

    if ((await moreButton.count()) === 0 || !(await moreButton.isVisible().catch(() => false))) {
      break;
    }

    const beforeCount = await page.locator(".box_wrap.box-4").count().catch(() => 0);
    await moreButton.click().catch(() => undefined);
    console.info(`[feelcycle] expanding rows from ${beforeCount}`);
    await waitForRowCountIncrease(page, beforeCount);
  }
}

async function readCurrentMonth(page: import("playwright").Page): Promise<string> {
  const text = await page
    .locator(".month .justify-center, .month .flex.white--text")
    .first()
    .textContent()
    .catch(() => null);

  return (text ?? "").replace(/\s+/g, " ").trim() || `month-${Date.now()}`;
}

async function readCurrentState(page: import("playwright").Page): Promise<HistoryViewState> {
  const monthLabel = await readCurrentMonth(page);
  const firstRowKey = await page
    .locator(".box_wrap.box-4 .text_bold_500")
    .first()
    .textContent()
    .catch(() => null);
  const recordCount = await page
    .locator(".box_wrap.box-4")
    .evaluateAll((elements) => elements.filter((element) => !element.className.includes("box_header")).length)
    .catch(() => 0);

  return {
    monthLabel,
    firstRowKey: (firstRowKey ?? "").replace(/\s+/g, " ").trim(),
    recordCount
  };
}

async function goToPreviousMonth(
  page: import("playwright").Page,
  currentState: HistoryViewState
): Promise<boolean> {
  const prevButton = page
    .locator(".month a.prevMonth")
    .filter({ hasText: "前月" })
    .first();
  if ((await prevButton.count()) === 0) {
    return false;
  }

  await prevButton.scrollIntoViewIfNeeded().catch(() => undefined);
  console.info(`[feelcycle] moving to previous month from ${currentState.monthLabel}`);
  await prevButton.click().catch(() => undefined);
  await waitForMonthChange(page, currentState);

  const nextState = await readCurrentState(page);
  console.info(`[feelcycle] month transition result: ${nextState.monthLabel}`);
  return nextState.monthLabel !== currentState.monthLabel || nextState.firstRowKey !== currentState.firstRowKey;
}

async function waitForRowCountIncrease(
  page: import("playwright").Page,
  previousCount: number
): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    const currentCount = await page.locator(".box_wrap.box-4").count().catch(() => previousCount);
    if (currentCount > previousCount) {
      await page.waitForTimeout(600);
      return;
    }

    await page.waitForTimeout(500);
  }
}

async function waitForMonthChange(
  page: import("playwright").Page,
  currentState: HistoryViewState
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const nextState = await readCurrentState(page);
    if (
      nextState.monthLabel !== currentState.monthLabel
      || nextState.firstRowKey !== currentState.firstRowKey
    ) {
      await page.waitForTimeout(800);
      return;
    }

    await page.waitForTimeout(500);
  }
}

async function waitForHistoryTabActivation(page: import("playwright").Page): Promise<void> {
  const historyTab = page.locator("ul.toggleTab2 > li").nth(1);

  for (let index = 0; index < 20; index += 1) {
    const classes = (await historyTab.getAttribute("class").catch(() => "")) ?? "";
    const monthLabel = await readCurrentMonth(page);
    if (classes.includes("active") && !monthLabel.startsWith("month-")) {
      return;
    }

    await page.waitForTimeout(500);
  }
}
