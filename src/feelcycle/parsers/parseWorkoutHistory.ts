import { load } from "cheerio";

import type { WorkoutInput } from "../types/workout.js";

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseWorkoutHistory(html: string): WorkoutInput[] {
  const $ = load(html);
  const boxes = $(".box_wrap.box-4")
    .toArray()
    .filter((element) => $(element).find(".tenpo, .bike_number").length > 0);

  return boxes.map((element, index) => {
    const root = $(element);
    const text = clean(root.text());
    const dateText = clean(root.find(".text_bold_500").first().text());
    const timeText = clean(root.find(".text_bold_500.mb05").first().text());
    const programText = clean(root.find(".underline").first().text());
    const instructorText = clean(root.find(".instructor").first().text());
    const studioText = clean(root.find(".tenpo").first().text()).replace(/^＠/, "");

    const dateMatch = dateText.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/);
    const timeMatch = timeText.match(/(\d{1,2}:\d{2})/);

    return {
      date: dateMatch?.[1] ?? "",
      studio: studioText || extractTextAfterKeyword(text, ["店", "studio"]) || `unknown-${index}`,
      program: programText || extractProgram(text),
      instructorName: instructorText,
      startTime: timeMatch?.[1] ?? "00:00",
      intensity: "",
      subjectiveMemo: "",
      conditionMemo: ""
    };
  });
}

function extractProgram(text: string): string {
  const match = text.match(/\b(BB1|BB2|BSL|BH1|BH2|BSB|RP[0-9A-Z]*)\b/i);
  return match?.[1] ?? "unknown-program";
}

function extractTextAfterKeyword(text: string, keywords: string[]): string | undefined {
  for (const keyword of keywords) {
    const index = text.indexOf(keyword);
    if (index >= 0) {
      return text.slice(0, index).trim() || undefined;
    }
  }

  return undefined;
}
