import fs from "node:fs/promises";
import path from "node:path";

import { fetchMyPageWorkouts } from "../feelcycle/fetchers/fetchMyPageWorkouts.js";
import { normalizeWorkoutInput } from "../feelcycle/normalizers/normalizeWorkoutInput.js";
import { parseWorkoutHistory } from "../feelcycle/parsers/parseWorkoutHistory.js";
import { FileWorkoutRepository } from "../storage/fileWorkoutRepository.js";
import { SupabaseWorkoutRepository } from "../storage/supabaseWorkoutRepository.js";

async function main(): Promise<void> {
  const snapshots = await fetchMyPageWorkouts();
  const parsed = snapshots.flatMap((snapshot) => parseWorkoutHistory(snapshot.html));
  const createdAt = new Date().toISOString();
  const records = [...new Map(parsed.map((input) => {
    const record = normalizeWorkoutInput(input, createdAt);
    return [record.id, record] as const;
  })).values()];

  await fs.mkdir(path.resolve(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(
    path.resolve(process.cwd(), "data", "feelcycle-history.json"),
    JSON.stringify(snapshots.map((snapshot) => ({ monthLabel: snapshot.monthLabel })), null, 2),
    "utf8"
  );
  if (snapshots[0]) {
    await fs.writeFile(path.resolve(process.cwd(), "data", "feelcycle-history.html"), snapshots[0].html, "utf8");
  }
  for (const [index, snapshot] of snapshots.entries()) {
    const safeMonthLabel = snapshot.monthLabel.replace(/[^\dA-Za-z\u3040-\u30ff\u4e00-\u9faf]+/g, "-");
    await fs.writeFile(
      path.resolve(process.cwd(), "data", `feelcycle-history-${String(index + 1).padStart(2, "0")}-${safeMonthLabel}.html`),
      snapshot.html,
      "utf8"
    );
  }

  await new FileWorkoutRepository().saveMany(records);
  await new SupabaseWorkoutRepository().saveMany(records);

  console.log(
    JSON.stringify(
      {
        monthsFetched: snapshots.length,
        fetched: records.length,
        syncedToSupabase: true
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
