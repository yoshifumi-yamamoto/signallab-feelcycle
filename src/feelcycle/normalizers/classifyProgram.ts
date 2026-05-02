export interface ProgramClassification {
  lessonKind: string;
  programFamily: string;
  programSeries: string | null;
  programVariant: string | null;
  programVersion: number | null;
  parseRule: string;
}

const standardProgramPattern = /^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+(.+?)(?:\s+(\d+))?$/;
const feelNowPattern = /^FEEL NOW ([BGS])(\d+)$/;
const lusterPattern = /^L (\d{2}) ([A-Z]+)(?: (\d+))?$/;

export function classifyProgram(program: string): ProgramClassification {
  const normalized = program.trim();
  const standardMatch = normalized.match(standardProgramPattern);
  if (standardMatch) {
    return {
      lessonKind: "regular",
      programFamily: "standard",
      programSeries: standardMatch[1] ?? null,
      programVariant: standardMatch[2]?.trim() ?? null,
      programVersion: standardMatch[3] ? Number.parseInt(standardMatch[3], 10) : null,
      parseRule: standardMatch[3] ? "standard_series_theme_version" : "standard_series_theme_only"
    };
  }

  const feelNowMatch = normalized.match(feelNowPattern);
  if (feelNowMatch) {
    return {
      lessonKind: "regular",
      programFamily: "feel_now",
      programSeries: "FEEL NOW",
      programVariant: (
        {
          B: "BLACK",
          G: "GOLD",
          S: "SILVER"
        } as const
      )[feelNowMatch[1] as "B" | "G" | "S"],
      programVersion: Number.parseInt(feelNowMatch[2] ?? "0", 10),
      parseRule: "feel_now_variant_cycle"
    };
  }

  const lusterMatch = normalized.match(lusterPattern);
  if (lusterMatch) {
    return {
      lessonKind: "regular",
      programFamily: "luster",
      programSeries: "LUSTER",
      programVariant: lusterMatch[2] ?? null,
      programVersion: Number.parseInt(lusterMatch[1] ?? "0", 10),
      parseRule: lusterMatch[3] ? "luster_edition_variant_version" : "luster_edition_variant"
    };
  }

  if (normalized === "SKRILLEX") {
    return {
      lessonKind: "regular",
      programFamily: "artist_series",
      programSeries: "SKRILLEX",
      programVariant: null,
      programVersion: null,
      parseRule: "artist_series_literal"
    };
  }

  if (normalized === "BEERCYCLE" || normalized === "10th SP") {
    return {
      lessonKind: "event",
      programFamily: "event",
      programSeries: normalized,
      programVariant: null,
      programVersion: null,
      parseRule: "event_literal"
    };
  }

  if (/^FEEL HIGH(?: \d+)?$/.test(normalized)) {
    return {
      lessonKind: "event",
      programFamily: "event",
      programSeries: "FEEL HIGH",
      programVariant: null,
      programVersion: normalized.match(/(\d+)$/)?.[1] ? Number.parseInt(normalized.match(/(\d+)$/)?.[1] ?? "0", 10) : null,
      parseRule: "event_series_version"
    };
  }

  return {
    lessonKind: "unknown",
    programFamily: "unknown",
    programSeries: null,
    programVariant: null,
    programVersion: null,
    parseRule: "unclassified"
  };
}

export function classifyTicket(label: string): {
  ticketKind: string;
  isSpecialTicket: boolean;
  specialTicketLabel: string;
} {
  const normalized = label.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return {
      ticketKind: "regular",
      isSpecialTicket: false,
      specialTicketLabel: ""
    };
  }

  if (normalized.includes("イベントチケット")) {
    return {
      ticketKind: "event_ticket",
      isSpecialTicket: true,
      specialTicketLabel: normalized
    };
  }

  if (/add\s*ticket/i.test(normalized) || normalized.includes("ADDITIONAL")) {
    return {
      ticketKind: "additional_ticket",
      isSpecialTicket: true,
      specialTicketLabel: normalized
    };
  }

  if (normalized.includes("他店利用チケット")) {
    return {
      ticketKind: "other_store_ticket",
      isSpecialTicket: true,
      specialTicketLabel: normalized
    };
  }

  return {
    ticketKind: "other",
    isSpecialTicket: true,
    specialTicketLabel: normalized
  };
}
