import { CARO_KANN } from "./caroKann";
import { RUY_LOPEZ } from "./ruyLopez";
import { SICILIAN } from "./sicilian";
import {
  findOpeningsWithActiveBook,
  getOpeningBookSuggestion,
  getCurrentVariation,
  isStillInOpeningBook,
} from "./matcher";
import type { BookSuggestion, OpeningDefinition, OpeningId } from "./types";

export type { BookSuggestion, OpeningDefinition, OpeningId, OpeningLine, OpeningSide } from "./types";
export {
  getOpeningBookSuggestion,
  getCurrentVariation,
  isStillInOpeningBook,
  hasBookContinuations,
  isOpeningLineExhausted,
  hasDeviatedFromOpening,
  findOpeningsWithActiveBook,
  normalizeSan,
  sanToUci,
} from "./matcher";
export {
  getLineById,
  validateStudyMove,
  getStudySuggestion,
  getNextMoveInLine,
  isLineComplete,
  formatLinePreview,
  colorAtPly,
  historyMatchesLine,
  type StudyColor,
  type StudyMoveValidation,
  type StudySuggestion,
} from "./study";

export const OPENINGS: Record<OpeningId, OpeningDefinition> = {
  "caro-kann": CARO_KANN,
  "ruy-lopez": RUY_LOPEZ,
  sicilian: SICILIAN,
};

export const OPENING_LIST = Object.values(OPENINGS);

export function getOpening(id: OpeningId | null): OpeningDefinition | null {
  if (!id) return null;
  return OPENINGS[id] ?? null;
}

export function lookupBookSuggestion(
  openingId: OpeningId | null,
  history: string[],
  fen: string
): BookSuggestion | null {
  const opening = getOpening(openingId);
  if (!opening) return null;
  return getOpeningBookSuggestion(opening, history, fen);
}

export function findSwitchableOpenings(
  history: string[],
  excludeOpeningId?: OpeningId
): OpeningDefinition[] {
  return findOpeningsWithActiveBook(OPENING_LIST, history, excludeOpeningId);
}

export function repertoireSideLabel(opening: OpeningDefinition): string {
  const side = opening.repertoireSide === "white" ? "White" : "Black";
  if (opening.playableAs === "both") {
    return `${side} repertoire · walk lines as both colours`;
  }
  return `${side} only`;
}
