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
    await ensureMyPageReady(page);
    return;
  }

  console.info("[feelcycle] opening history page");
  await gotoHistoryPage(page);
  await ensureMyPageReady(page);
}

async function openHistoryTab(page: import("playwright").Page): Promise<void> {
  await ensureMyPageReady(page);
  await waitForHistoryTabsReady(page);

  const historyTab = page
    .locator("ul.toggleTab2 > li")
    .filter({ hasText: "受講履歴" })
    .first();
  if ((await historyTab.count()) === 0) {
    throw new Error("History tab was not found on FEELCYCLE my page");
  }

  const classes = (await historyTab.getAttribute("class").catch(() => "")) ?? "";
  if (classes.includes("active") && await isHistoryPanelVisible(page)) {
    console.info("[feelcycle] history tab already active");
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    console.info(`[feelcycle] switching to history tab (attempt ${attempt + 1})`);
    await historyTab.click({ force: true }).catch(() => undefined);
    if (await waitForHistoryTabActivation(page, 8)) {
      await waitForHistoryMonthLabel(page);
      return;
    }

    await page.waitForTimeout(1500);
  }

  throw new Error("History tab did not become active");
}

async function collectHistoryPages(
  page: import("playwright").Page,
  maxMonths: number
): Promise<MonthlyHistorySnapshot[]> {
  const snapshots: MonthlyHistorySnapshot[] = [];
  const seenMonths = new Set<string>();

  for (let index = 0; index < maxMonths; index += 1) {
    await expandAllHistoryRows(page);
    await waitForHistoryMonthLabel(page);
    const state = await readCurrentState(page);
    if (!state.monthLabel || state.monthLabel.startsWith("month-")) {
      throw new Error("Failed to detect FEELCYCLE history month label");
    }

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
      console.info("[feelcycle] current month is empty, continuing to previous month");
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
  const primaryMonthLocator = page.locator(".month .flex.white--text").filter({ visible: true });
  if ((await primaryMonthLocator.count().catch(() => 0)) > 0) {
    const text = ((await primaryMonthLocator.first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  const fallbackMonthLocator = page.locator(".month .justify-center").filter({ visible: true });
  if ((await fallbackMonthLocator.count().catch(() => 0)) > 0) {
    const text = ((await fallbackMonthLocator.first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  const firstDateText = await readVisibleDateText(page);
  const dateMatch = (firstDateText ?? "").match(/(\d{4})[\/-](\d{1,2})[\/-]\d{1,2}/);
  if (dateMatch) {
    return `${dateMatch[1]}年${Number.parseInt(dateMatch[2] ?? "0", 10)}月`;
  }

  return `month-${Date.now()}`;
}

async function readCurrentState(page: import("playwright").Page): Promise<HistoryViewState> {
  const monthLabel = await readCurrentMonth(page);
  const firstRowKey = await readVisibleText(page, [".box_wrap.box-4 .text_bold_500"]);
  const recordCount = await page.evaluate(() => {
    const windowRef = (globalThis as any).window;
    const documentRef = (globalThis as any).document;
    const isVisibleElement = (element: any): boolean => {
      const style = windowRef.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      return element.getClientRects().length > 0;
    };

    const elements = [...documentRef.querySelectorAll(".box_wrap.box-4")];

    return elements.filter((element) => {
      if (element.className.includes("box_header")) {
        return false;
      }

      return isVisibleElement(element);
    }).length;
  }).catch(() => 0);

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

async function waitForHistoryTabActivation(
  page: import("playwright").Page,
  attempts = 20
): Promise<boolean> {
  const historyTab = page
    .locator("ul.toggleTab2 > li")
    .filter({ hasText: "受講履歴" })
    .first();

  for (let index = 0; index < attempts; index += 1) {
    const classes = (await historyTab.getAttribute("class").catch(() => "")) ?? "";
    if (classes.includes("active")) {
      return true;
    }

    const monthLabel = await readCurrentMonth(page);
    const hasHistoryControls = await hasVisibleHistoryControls(page);
    if (hasHistoryControls && !monthLabel.startsWith("month-")) {
      return true;
    }

    await page.waitForTimeout(500);
  }

  return false;
}

async function isHistoryPanelVisible(page: import("playwright").Page): Promise<boolean> {
  return page.evaluate(() => {
    const windowRef = (globalThis as any).window;
    const documentRef = (globalThis as any).document;
    const isVisibleElement = (element: any): boolean => {
      const style = windowRef.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      return element.getClientRects().length > 0;
    };

    const candidates = [
      ...documentRef.querySelectorAll(".thisMonth"),
      ...documentRef.querySelectorAll(".month .prevMonth"),
      ...documentRef.querySelectorAll(".box_wrap.box-4")
    ];

    return candidates.some((element) => isVisibleElement(element));
  }).catch(() => false);
}

async function hasVisibleHistoryControls(page: import("playwright").Page): Promise<boolean> {
  return page.evaluate(() => {
    const windowRef = (globalThis as any).window;
    const documentRef = (globalThis as any).document;
    const isVisibleElement = (element: any): boolean => {
      const style = windowRef.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      return element.getClientRects().length > 0;
    };

    const controls = [
      ...documentRef.querySelectorAll(".thisMonth"),
      ...documentRef.querySelectorAll(".month .prevMonth"),
      ...documentRef.querySelectorAll(".month .flex.white--text")
    ];

    return controls.some((element) => isVisibleElement(element));
  }).catch(() => false);
}

async function gotoHistoryPage(page: import("playwright").Page): Promise<void> {
  await page.goto(env.feelcycleHistoryUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
}

async function ensureMyPageReady(page: import("playwright").Page): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await waitForMyPageReady(page)) {
      return;
    }

    if (attempt === 0) {
      console.info("[feelcycle] reloading history page after incomplete my page render");
      await gotoHistoryPage(page);
    }
  }

  const diagnostics = await collectPageDiagnostics(page);
  throw new Error(`FEELCYCLE my page UI did not finish loading: ${diagnostics}`);
}

async function waitForMyPageReady(page: import("playwright").Page): Promise<boolean> {
  for (let index = 0; index < 30; index += 1) {
    const hasTabs = await page.locator("ul.toggleTab2 > li").count().catch(() => 0);
    const bodyText = ((await page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    const title = await page.title().catch(() => "");
    const hasMyPageTitle = title.includes("MYPAGE") || bodyText.includes("MY PAGE");
    const hasHistoryLabels = bodyText.includes("受講履歴") && bodyText.includes("予約状況");

    if (hasTabs >= 2 || (hasMyPageTitle && hasHistoryLabels)) {
      return true;
    }

    await page.waitForTimeout(500);
  }

  return false;
}

async function collectPageDiagnostics(page: import("playwright").Page): Promise<string> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = ((await page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
  const preview = bodyText.slice(0, 160);

  return JSON.stringify({
    url,
    title,
    bodyPreview: preview
  });
}

async function waitForHistoryTabsReady(page: import("playwright").Page): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const tabCount = await page.locator("ul.toggleTab2 > li").count().catch(() => 0);
    const historyText = await page
      .locator("ul.toggleTab2 > li")
      .filter({ hasText: "受講履歴" })
      .first()
      .textContent()
      .catch(() => null);

    if (tabCount >= 2 && (historyText ?? "").includes("受講履歴")) {
      await page.waitForTimeout(5000);
      return;
    }

    await page.waitForTimeout(500);
  }
}

async function waitForHistoryMonthLabel(page: import("playwright").Page): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const monthLabel = await readCurrentMonth(page);
    if (!monthLabel.startsWith("month-")) {
      await page.waitForTimeout(800);
      return;
    }

    await page.waitForTimeout(500);
  }
}

async function readVisibleText(
  page: import("playwright").Page,
  selectors: string[]
): Promise<string | null> {
  return page.evaluate((inputSelectors) => {
    const windowRef = (globalThis as any).window;
    const documentRef = (globalThis as any).document;
    const isVisibleElement = (element: any): boolean => {
      const style = windowRef.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      return element.getClientRects().length > 0;
    };

    for (const selector of inputSelectors) {
      const elements = [...documentRef.querySelectorAll(selector)];
      for (const element of elements) {
        if (!isVisibleElement(element)) {
          continue;
        }

        const text = element.textContent?.replace(/\s+/g, " ").trim();
        if (text) {
          return text;
        }
      }
    }

    return null;
  }, selectors).catch(() => null);
}

async function readVisibleDateText(page: import("playwright").Page): Promise<string | null> {
  return page.evaluate(() => {
    const windowRef = (globalThis as any).window;
    const documentRef = (globalThis as any).document;
    const isVisibleElement = (element: any): boolean => {
      const style = windowRef.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      return element.getClientRects().length > 0;
    };

    const texts = [...documentRef.querySelectorAll(".box_wrap.box-4 .text_bold_500")];
    for (const element of texts) {
      if (!isVisibleElement(element)) {
        continue;
      }

      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(text)) {
        return text;
      }
    }

    return null;
  }).catch(() => null);
}
