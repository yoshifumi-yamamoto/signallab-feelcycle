import fs from "node:fs/promises";
import path from "node:path";

import { workoutRecordSchema, type WorkoutRecord } from "../feelcycle/types/workout.js";
import { parseJsonl, toJsonl } from "../utils/jsonl.js";

export class FileWorkoutRepository {
  private readonly filePath = path.resolve(process.cwd(), "data", "workouts.jsonl");

  async saveMany(records: WorkoutRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, toJsonl(records.map((record) => workoutRecordSchema.parse(record))), "utf8");
  }

  async findAll(): Promise<WorkoutRecord[]> {
    try {
      const content = await fs.readFile(this.filePath, "utf8");
      return parseJsonl<unknown>(content).map((row) => workoutRecordSchema.parse(row));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}
