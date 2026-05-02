import { chromium, type BrowserContext, type Page } from "playwright";

import { env } from "../../config/env.js";
import { waitForEnter } from "../../utils/prompt.js";

export async function createLoggedInContext(): Promise<{ context: BrowserContext; page: Page }> {
  if (!env.feelcycleLoginUrl) {
    throw new Error("FEELCYCLE_LOGIN_URL is required");
  }

  const browser = await chromium.launch({ headless: env.feelcycleHeadless });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(env.feelcycleLoginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.info("[feelcycle] opened login page");

  if (!env.feelcycleManualLogin && env.feelcycleEmail && env.feelcyclePassword) {
    await tryAutoLogin(page, env.feelcycleEmail, env.feelcyclePassword);
  }

  if (env.feelcycleManualLogin) {
    console.info("[feelcycle] waiting for manual login");
    await waitForEnter("Login manually in the opened browser, then press Enter here to continue");
  }

  return { context, page };
}

async function tryAutoLogin(page: Page, email: string, password: string): Promise<void> {
  const emailInput = page.locator("input[type='email'], input[name*='mail'], input[name*='email']").first();
  const passwordInput = page
    .locator("input[type='password'], input[name*='pass'], input[name*='password']")
    .first();

  if ((await emailInput.count()) === 0 || (await passwordInput.count()) === 0) {
    return;
  }

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitButton = page
    .locator("button[type='submit'], input[type='submit'], button:has-text('ログイン'), button:has-text('Login')")
    .first();

  if ((await submitButton.count()) > 0) {
    console.info("[feelcycle] submitting login form");
    await submitButton.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
  }
}
