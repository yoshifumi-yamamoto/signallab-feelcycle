import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { env } from "../../config/env.js";
import { waitForEnter } from "../../utils/prompt.js";

export async function createLoggedInContext(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!env.feelcycleLoginUrl) {
    throw new Error("FEELCYCLE_LOGIN_URL is required");
  }

  const browser = await chromium.launch({
    headless: env.feelcycleHeadless,
    args: ["--disable-blink-features=AutomationControlled"]
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined
    });
  });

  await page.goto(env.feelcycleLoginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.info("[feelcycle] opened login page");

  if (!env.feelcycleManualLogin && env.feelcycleEmail && env.feelcyclePassword) {
    await tryAutoLogin(page, env.feelcycleEmail, env.feelcyclePassword);
    await ensureLoggedIn(page);
  }

  if (env.feelcycleManualLogin) {
    console.info("[feelcycle] waiting for manual login");
    await waitForEnter("Login manually in the opened browser, then press Enter here to continue");
  }

  return { browser, context, page };
}

async function tryAutoLogin(page: Page, email: string, password: string): Promise<void> {
  const emailCandidates = page
    .locator("input[name='email'], input[type='email'], input[name*='mail'], input[name*='email']")
    .filter({ visible: true });
  const passwordCandidates = page
    .locator("input[name='password'], input[type='password'], input[name*='pass']")
    .filter({ visible: true });

  const emailCount = await emailCandidates.count();
  const passwordCount = await passwordCandidates.count();

  if (emailCount === 0 || passwordCount === 0) {
    console.info("[feelcycle] login form fields were not found");
    return;
  }

  const emailInput = emailCandidates.first();
  const passwordInput = passwordCandidates.first();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitCandidates = page
    .locator("button, input[type='submit']")
    .filter({ hasText: "ログイン", visible: true });
  const submitCount = await submitCandidates.count();

  if (submitCount > 0) {
    const submitButton = submitCandidates.first();
    console.info("[feelcycle] submitting login form");
    await submitButton.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    await waitForPostLoginTransition(page);
    return;
  }

  console.info("[feelcycle] login button was not found");
}

async function waitForPostLoginTransition(page: Page): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    const url = page.url();
    const title = await page.title().catch(() => "");
    const bodyText = (await page.locator("body").textContent().catch(() => "")) ?? "";
    const normalizedBodyText = bodyText.replace(/\s+/g, " ").trim();
    const userNameCount = await page.locator(".user_name").count().catch(() => 0);
    const tabCount = await page.locator("ul.toggleTab2 > li").count().catch(() => 0);

    const isLoggedInPage = (
      (url.includes("/mypage") || title.includes("MYPAGE"))
      && (userNameCount > 0 || tabCount >= 2 || (normalizedBodyText.includes("受講履歴") && normalizedBodyText.includes("予約状況")))
    );
    const stillOnLoginForm = (await page.locator("input[type='password']").count().catch(() => 0)) > 0;

    if (isLoggedInPage && !stillOnLoginForm) {
      await page.waitForTimeout(1500);
      return;
    }

    await page.waitForTimeout(500);
  }
}

async function ensureLoggedIn(page: Page): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (await isLoggedInPage(page)) {
      return;
    }

    await page.waitForTimeout(500);
  }

  const title = await page.title().catch(() => "");
  const bodyText = ((await page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
  const preview = bodyText.slice(0, 160);
  throw new Error(`FEELCYCLE login did not complete: ${JSON.stringify({ url: page.url(), title, bodyPreview: preview })}`);
}

async function isLoggedInPage(page: Page): Promise<boolean> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = ((await page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
  const userNameCount = await page.locator(".user_name").count().catch(() => 0);
  const tabCount = await page.locator("ul.toggleTab2 > li").count().catch(() => 0);
  const passwordInputs = page.locator("input[name='password'], input[type='password']").filter({ visible: true });
  const visiblePasswordCount = await passwordInputs.count().catch(() => 0);

  return (
    (url.includes("/mypage") || title.includes("MYPAGE"))
    && (userNameCount > 0 || tabCount >= 2 || (bodyText.includes("受講履歴") && bodyText.includes("予約状況")))
    && visiblePasswordCount === 0
  );
}
