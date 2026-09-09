import fs from "node:fs/promises";
import path from "node:path";

interface HistoryFile {
  summary: { store: { id: number; name: string; code: string }; from: string; to?: string; days: number; slots: number };
}

const directory = path.resolve("data", "feelcycle-official-history");
const files = (await fs.readdir(directory)).filter((file) => /^store-\d+\.json$/.test(file));
const histories = await Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as HistoryFile));
const storeIds = new Set(histories.map((history) => history.summary.store.id));
const summary = {
  stores: storeIds.size,
  from: histories.map((history) => history.summary.from).sort()[0],
  to: histories.map((history) => history.summary.to ?? "").sort().at(-1),
  daysByStore: Object.fromEntries(histories.map((history) => [history.summary.store.code, history.summary.days])),
  slots: histories.reduce((sum, history) => sum + history.summary.slots, 0)
};
if (storeIds.size !== 36 || histories.some((history) => history.summary.days < 1700 || history.summary.slots === 0)) {
  throw new Error(`Incomplete official history: ${JSON.stringify(summary)}`);
}
await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify({ validatedAt: new Date().toISOString(), ...summary }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
