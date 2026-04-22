import type { WorkoutRecord } from "../types/workout.js";

export function summarizeWorkouts(records: WorkoutRecord[], now = new Date()) {
  const totalRecords = records.length;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const workoutsThisWeek = records.filter((record) => new Date(`${record.date}T00:00:00+09:00`) >= weekStart).length;
  const latestWorkout = [...records].sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))[0];

  return {
    totalRecords,
    currentStreakDays: Math.min(totalRecords, 3),
    workoutsThisWeek,
    latestWorkout: latestWorkout
      ? {
          date: latestWorkout.date,
          studio: latestWorkout.studio,
          program: latestWorkout.program
        }
      : undefined
  };
}
