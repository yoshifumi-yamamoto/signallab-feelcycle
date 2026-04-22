import { summarizeWorkouts } from "../feelcycle/summary/summarizeWorkouts.js";
import { FileWorkoutRepository } from "../storage/fileWorkoutRepository.js";

async function main(): Promise<void> {
  const records = await new FileWorkoutRepository().findAll();
  console.log(JSON.stringify(summarizeWorkouts(records), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
