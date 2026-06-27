export type OpeningSide = "white" | "black" | "both";

export type OpeningDefinition = {
  id: string;
  name: string;
  /** Which colour this opening is played as in tournament chess. */
  repertoireSide: "white" | "black";
  /** Can the user practice both sides of the book lines on this board? */
  playableAs: OpeningSide;
  ecoRange: string;
  description: string;
  /** First moves to enter the opening (hint for the user). */
  entryMoves: string;
  lines: OpeningLine[];
};

export type OpeningLine = {
  id: string;
  name: string;
  eco: string;
  /** Full SAN sequence from the starting position. */
  moves: string[];
};

export type BookSuggestion = {
  openingId: string;
  openingName: string;
  variationName: string;
  eco: string;
  san: string;
  uci: string;
  /** Remaining SAN moves on the primary book line (Stockfish-style line). */
  continuation: string;
  /** Other book continuations at this branch. */
  alternativeLines: { name: string; eco: string; continuation: string }[];
  /** @deprecated use alternativeLines */
  alternatives: { san: string; name: string }[];
  outOfBook: boolean;
};

export type OpeningId = "caro-kann" | "ruy-lopez" | "sicilian";
