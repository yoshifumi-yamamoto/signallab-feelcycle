import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function normalizeSupabaseUrl(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/\/rest\/v1\/?$/, "");
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  feelcycleEmail: process.env.FEELCYCLE_EMAIL,
  feelcyclePassword: process.env.FEELCYCLE_PASSWORD,
  feelcycleLoginUrl: process.env.FEELCYCLE_LOGIN_URL ?? "",
  feelcycleHistoryUrl: process.env.FEELCYCLE_HISTORY_URL ?? "",
  feelcycleHeadless: process.env.FEELCYCLE_HEADLESS !== "false",
  feelcycleManualLogin: process.env.FEELCYCLE_MANUAL_LOGIN === "true",
  feelcycleHistoryMonths: Number.parseInt(process.env.FEELCYCLE_HISTORY_MONTHS ?? "12", 10),
  feelcycleSaveSnapshots: process.env.FEELCYCLE_SAVE_SNAPSHOTS !== "false",
  feelcycleSaveLocalRecords: process.env.FEELCYCLE_SAVE_LOCAL_RECORDS !== "false"
};
