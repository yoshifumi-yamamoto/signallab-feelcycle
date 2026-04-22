import { importWorkoutCsv } from "../feelcycle/importers/csvWorkoutImporter.js";
import { normalizeWorkoutInput } from "../feelcycle/normalizers/normalizeWorkoutInput.js";
import { FileWorkoutRepository } from "../storage/fileWorkoutRepository.js";

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npm run dev:import-csv -- <csvFilePath>");
  }
  const createdAt = new Date().toISOString();
  const inputs = await importWorkoutCsv(filePath);
  const records = inputs.map((input) => normalizeWorkoutInput(input, createdAt));
  await new FileWorkoutRepository().saveMany(records);
  console.log(JSON.stringify({ imported: records.length, filePath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
