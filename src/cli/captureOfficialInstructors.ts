import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";
import { createLoggedInContext } from "../feelcycle/auth/login.js";

interface InstructorResponse {
  result_code?: number;
  instructor_list?: Array<{ uid: number; name: string; path_img?: string; store_list?: Array<{ store_name: string }> }>;
}

async function main(): Promise<void> {
  const { browser, context, page } = await createLoggedInContext();
  let body: InstructorResponse | undefined;
  try {
    await page.goto(new URL(env.feelcycleLoginUrl).origin + "/reserve", { waitUntil: "networkidle" });
    page.on("response", async (response) => {
      if (response.url().includes("/api/reserve/instructors") && response.status() === 200) {
        body = await response.json() as InstructorResponse;
      }
    });
    await page.locator("a[href='/reserve/search/instructor']").evaluate((node) => (node as unknown as { click(): void }).click());
    await page.waitForTimeout(3000);
  } finally {
    await context.close();
    await browser.close();
  }

  const instructors = body?.instructor_list ?? [];
  if (body?.result_code !== 0 || instructors.length < 200) throw new Error(`Incomplete instructor capture: ${instructors.length}`);
  const capturedAt = new Date().toISOString();
  await fs.mkdir(path.resolve("data"), { recursive: true });
  await fs.writeFile(path.resolve("data", "feelcycle-official-instructors.json"), JSON.stringify({ capturedAt, count: instructors.length, instructors }, null, 2), "utf8");
  console.log(JSON.stringify({ instructors: instructors.length, affiliations: instructors.reduce((sum, item) => sum + (item.store_list?.length ?? 0), 0) }, null, 2));
}

await main().catch((error) => { console.error(error); process.exitCode = 1; });
