import { normalizeWorkoutInput } from "../feelcycle/normalizers/normalizeWorkoutInput.js";
import { FileWorkoutRepository } from "../storage/fileWorkoutRepository.js";
import { ask } from "../utils/prompt.js";

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const record = normalizeWorkoutInput(
    {
      date: await ask("date", today),
      studio: await ask("studio"),
      program: await ask("program"),
      startTime: await ask("startTime", "19:30"),
      intensity: await ask("intensity"),
      subjectiveMemo: await ask("subjectiveMemo"),
      conditionMemo: await ask("conditionMemo")
    },
    new Date().toISOString()
  );

  await new FileWorkoutRepository().saveMany([record]);
  console.log(JSON.stringify({ saved: 1, id: record.id }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
