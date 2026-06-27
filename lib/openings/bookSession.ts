import {
  findOpeningsWithActiveBook,
  getCurrentVariation,
  hasBookContinuations,
  hasDeviatedFromOpening,
  isOpeningLineExhausted,
} from "./matcher";
import type { OpeningDefinition } from "./types";

export type OpeningTrackState = {
  inBook: boolean;
  variationId: string;
  exhausted: boolean;
};

export type OpeningTransitionEvent =
  | { type: "variation"; name: string }
  | { type: "deviated"; openingName: string; switchTo: OpeningDefinition[] }
  | { type: "exhausted"; label: string; onSelect?: boolean }
  | { type: "left_book" };

const EMPTY_TRACK: OpeningTrackState = {
  inBook: false,
  variationId: "",
  exhausted: false,
};

export function emptyOpeningTrackState(): OpeningTrackState {
  return { ...EMPTY_TRACK };
}

/**
 * Opening-agnostic book tracking — same rules for Caro-Kann, Ruy Lopez, Sicilian, etc.
 */
export function evaluateOpeningTransitions(
  opening: OpeningDefinition,
  history: string[],
  prev: OpeningTrackState,
  options: {
    openingJustChanged: boolean;
    allOpenings: OpeningDefinition[];
  }
): { events: OpeningTransitionEvent[]; next: OpeningTrackState } {
  const inBook = hasBookContinuations(opening, history);
  const exhausted = isOpeningLineExhausted(opening, history);
  const deviated = hasDeviatedFromOpening(opening, history);
  const variation = getCurrentVariation(opening, history);
  const varId = variation?.id ?? "";
  const next: OpeningTrackState = { inBook, variationId: varId, exhausted };
  const events: OpeningTransitionEvent[] = [];

  const switchTo = findOpeningsWithActiveBook(
    options.allOpenings,
    history,
    opening.id
  );

  const exhaustedLabel = variation
    ? `${variation.name} (${variation.eco})`
    : opening.name;

  if (options.openingJustChanged && history.length > 0) {
    if (deviated) {
      events.push({ type: "deviated", openingName: opening.name, switchTo });
    } else if (exhausted) {
      events.push({ type: "exhausted", label: exhaustedLabel, onSelect: true });
    } else if (inBook && variation) {
      events.push({ type: "variation", name: variation.name });
    }
    return { events, next };
  }

  if (history.length >= 1) {
    if (inBook && variation && varId && varId !== prev.variationId) {
      events.push({ type: "variation", name: variation.name });
    } else if (!prev.inBook && inBook && variation) {
      events.push({ type: "variation", name: variation.name });
    }

    if (prev.inBook && !inBook) {
      if (exhausted) {
        events.push({ type: "exhausted", label: exhaustedLabel });
      } else if (deviated) {
        events.push({ type: "deviated", openingName: opening.name, switchTo });
      } else {
        events.push({ type: "left_book" });
      }
    }
  }

  return { events, next };
}

export function openingTransitionToMessages(
  events: OpeningTransitionEvent[]
): { message: string; kind: "info" | "success" | "warn" }[] {
  return events.map((event) => {
    switch (event.type) {
      case "variation":
        return {
          kind: "info" as const,
          message: `Detected ${event.name} variation, suggestion recalculated`,
        };
      case "exhausted":
        return {
          kind: "success" as const,
          message: event.onSelect
            ? `Opening line already complete here — ${event.label}. Switching to Stockfish suggestions.`
            : `Opening line complete — ${event.label}. Switching to Stockfish suggestions.`,
        };
      case "deviated": {
        let message = `This move is not in ${event.openingName}. No eligible variations remain in this opening. Switching to Stockfish.`;
        if (event.switchTo.length > 0) {
          message += ` Consider switching to: ${event.switchTo.map((o) => o.name).join(", ")}.`;
        }
        return { kind: "warn" as const, message };
      };
      case "left_book":
        return {
          kind: "warn" as const,
          message: "Left opening book — switching to Stockfish suggestions.",
        };
    }
  });
}

/** True when book suggestions should be shown (both colours, any opening). */
export function shouldUseBookSuggestion(
  openingId: string | null,
  history: string[],
  fen: string,
  lookup: (id: string, history: string[], fen: string) => unknown | null
): boolean {
  if (!openingId) return false;
  return lookup(openingId, history, fen) != null;
}

/** Stockfish only when out of book and the side filter allows it. */
export function shouldQueryStockfish(
  suggestFor: "white" | "black" | "both",
  sideToMove: "white" | "black",
  inBook: boolean
): boolean {
  if (inBook) return false;
  return suggestFor === "both" || suggestFor === sideToMove;
}

/** Auto-move / confirm apply to book moves for either side. */
export function canApplySuggestion(
  suggestFor: "white" | "black" | "both",
  sideToMove: "white" | "black",
  fromBook: boolean
): boolean {
  if (fromBook) return true;
  return suggestFor === "both" || suggestFor === sideToMove;
}
