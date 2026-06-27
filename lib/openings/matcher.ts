import { Chess } from "chess.js";
import type { BookSuggestion, OpeningDefinition, OpeningLine } from "./types";

export function normalizeSan(san: string): string {
  return san.replace(/[+#!?]/g, "").trim();
}

/** Turn SAN into UCI from the current FEN (for arrows / auto-move). */
export function sanToUci(fen: string, san: string): string | null {
  try {
    const board = new Chess(fen);
    const move = board.move(san);
    if (!move) return null;
    return move.from + move.to + (move.promotion ?? "");
  } catch {
    return null;
  }
}

function linesExtendingHistory(
  lines: OpeningLine[],
  history: string[]
): OpeningLine[] {
  const norm = history.map(normalizeSan);
  return lines.filter((line) => {
    if (line.moves.length <= norm.length) return false;
    return norm.every((m, i) => normalizeSan(line.moves[i]!) === m);
  });
}

/** Longest line whose move list still matches the game so far. */
export function getCurrentVariation(
  opening: OpeningDefinition,
  history: string[]
): OpeningLine | null {
  const norm = history.map(normalizeSan);
  if (norm.length === 0) return null;

  let best: OpeningLine | null = null;
  for (const line of opening.lines) {
    if (line.moves.length < norm.length) continue;
    const ok = norm.every((m, i) => normalizeSan(line.moves[i]!) === m);
    if (!ok) continue;
    if (!best || line.moves.length < best.moves.length) {
      best = line;
    }
  }
  return best;
}

function lineContinuation(line: OpeningLine, fromIndex: number): string {
  return line.moves.slice(fromIndex).join(" ");
}

function buildBookSuggestion(
  opening: OpeningDefinition,
  history: string[],
  fen: string,
  extending: OpeningLine[]
): BookSuggestion | null {
  const nextIndex = history.length;
  const byNext = new Map<string, OpeningLine>();
  for (const line of extending) {
    const san = line.moves[nextIndex]!;
    if (!byNext.has(san)) byNext.set(san, line);
  }

  const branches = [...byNext.entries()].map(([san, line]) => ({
    san,
    line,
    continuation: lineContinuation(line, nextIndex),
  }));

  if (branches.length === 0) return null;

  const primary = branches[0]!;
  const uci = sanToUci(fen, primary.san);
  if (!uci) return null;

  const context = getCurrentVariation(opening, history);

  const alternativeLines = branches.slice(1).map((b) => ({
    name: b.line.name,
    eco: b.line.eco,
    continuation: b.continuation,
  }));

  return {
    openingId: opening.id,
    openingName: opening.name,
    variationName: context?.name ?? primary.line.name,
    eco: primary.line.eco,
    san: primary.san,
    uci: uci.length >= 4 ? uci.slice(0, 4) : uci,
    continuation: primary.continuation,
    alternativeLines,
    alternatives: alternativeLines.map((a) => ({
      san: a.continuation.split(" ")[0] ?? "",
      name: a.name,
    })),
    outOfBook: false,
  };
}

export function getOpeningBookSuggestion(
  opening: OpeningDefinition,
  history: string[],
  fen: string
): BookSuggestion | null {
  if (opening.lines.length === 0) return null;

  const extending = linesExtendingHistory(opening.lines, history);

  if (extending.length === 0) {
    if (history.length === 0) {
      const main = opening.lines[0]!;
      const san = main.moves[0]!;
      const uci = sanToUci(fen, san);
      if (!uci) return null;
      return {
        openingId: opening.id,
        openingName: opening.name,
        variationName: main.name,
        eco: main.eco,
        san,
        uci: uci.slice(0, 4),
        continuation: lineContinuation(main, 0),
        alternativeLines: [],
        alternatives: [],
        outOfBook: false,
      };
    }
    return null;
  }

  return buildBookSuggestion(opening, history, fen, extending);
}

export function isStillInOpeningBook(
  opening: OpeningDefinition,
  history: string[]
): boolean {
  if (history.length === 0) return true;
  return linesExtendingHistory(opening.lines, history).length > 0;
}
