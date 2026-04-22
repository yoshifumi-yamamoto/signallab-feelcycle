import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function ask(label: string, defaultValue = ""): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` (${defaultValue})` : "";
    const answer = await rl.question(`${label}${suffix}: `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}
