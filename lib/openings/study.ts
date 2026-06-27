import { Chess } from "chess.js";
import type { OpeningDefinition, OpeningLine } from "./types";
import { normalizeSan, sanToUci } from "./matcher";

export type StudyColor = "white" | "black";

export type StudyMoveValidation = {
  valid: boolean;
  expected: string | null;
  played: string | null;
  message: string;
  lineComplete: boolean;
};

export function getLineById(
  opening: OpeningDefinition,
  lineId: string
): OpeningLine | null {
  return opening.lines.find((l) => l.id === lineId) ?? null;
}

export function colorAtPly(ply: number): StudyColor {
  return ply % 2 === 0 ? "white" : "black";
}

export function historyMatchesLine(line: OpeningLine, history: string[]): boolean {
  if (history.length > line.moves.length) return false;
  return history.every(
    (m, i) => normalizeSan(m) === normalizeSan(line.moves[i]!)
  );
}

export function getNextMoveInLine(
  line: OpeningLine,
  history: string[]
): string | null {
  if (history.length >= line.moves.length) return null;
  return line.moves[history.length] ?? null;
}

export function isLineComplete(line: OpeningLine, history: string[]): boolean {
  return history.length >= line.moves.length;
}

export function validateStudyMove(
  line: OpeningLine,
  history: string[],
  playedSan: string
): StudyMoveValidation {
  const ply = history.length;
  const expected = getNextMoveInLine(line, history);

  if (!expected) {
    return {
      valid: false,
      expected: null,
      played: playedSan,
      lineComplete: true,
      message: `This training line (${line.name}) is already complete.`,
    };
  }

  const ok = normalizeSan(playedSan) === normalizeSan(expected);
  if (ok) {
    const nextPly = ply + 1;
    const done = nextPly >= line.moves.length;
    return {
      valid: true,
      expected,
      played: playedSan,
      lineComplete: done,
      message: done
        ? `Correct — you finished ${line.name} (${line.eco}).`
        : `Correct — ${playedSan} matches the book.`,
    };
  }

  const side = colorAtPly(ply);
  const remaining = line.moves.slice(ply).join(" ");
  return {
    valid: false,
    expected,
    played: playedSan,
    lineComplete: false,
    message:
      `Wrong move for ${line.name} (${line.eco}). ` +
      `${side === "white" ? "White" : "Black"} should play ${expected}, not ${playedSan}. ` +
      `This line continues: ${remaining}.`,
  };
}

export type StudySuggestion = {
  san: string;
  uci: string;
  continuation: string;
  variationName: string;
  eco: string;
};

export function getStudySuggestion(
  line: OpeningLine,
  history: string[],
  fen: string,
  userColor: StudyColor
): StudySuggestion | null {
  const sideToMove = new Chess(fen).turn() === "w" ? "white" : "black";
  if (sideToMove !== userColor) return null;

  const san = getNextMoveInLine(line, history);
  if (!san) return null;

  const uci = sanToUci(fen, san);
  if (!uci) return null;

  return {
    san,
    uci: uci.slice(0, 4),
    continuation: line.moves.slice(history.length).join(" "),
    variationName: line.name,
    eco: line.eco,
  };
}

export function formatLinePreview(line: OpeningLine, maxMoves = 8): string {
  const slice = line.moves.slice(0, maxMoves);
  let out = "";
  for (let i = 0; i < slice.length; i++) {
    if (i % 2 === 0) out += `${i / 2 + 1}. `;
    out += `${slice[i]} `;
  }
  if (line.moves.length > maxMoves) out += "…";
  return out.trim();
}
