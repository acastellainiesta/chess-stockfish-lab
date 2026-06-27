import type { CSSProperties } from "react";
import type { Chess } from "chess.js";

/** Lichess-style last-move tint on both the origin and destination squares. */
const LAST_MOVE_HIGHLIGHT: CSSProperties = {
  backgroundColor: "rgba(155, 199, 0, 0.41)",
};

const SELECTED_HIGHLIGHT: CSSProperties = {
  backgroundColor: "rgba(234, 88, 12, 0.45)",
};

const FORCE_MOVE_HIGHLIGHT: CSSProperties = {
  backgroundColor: "rgba(239, 68, 68, 0.5)",
  boxShadow: "inset 0 0 0 3px #ef4444",
};

const LEGAL_MOVE_DOT: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, rgba(234,88,12,0.55) 22%, transparent 23%)",
};

const LEGAL_CAPTURE_RING: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, transparent 55%, rgba(234,88,12,0.55) 56%)",
};

function setSquare(
  map: Record<string, CSSProperties>,
  square: string,
  style: CSSProperties
) {
  map[square] = map[square] ? { ...map[square], ...style } : { ...style };
}

export type BoardHighlightOptions = {
  selectedSquare?: string | null;
  forceMoveFrom?: string | null;
};

/** Square styles: last move, then force-move / selection overlays (chess.com / Lichess style). */
export function buildBoardSquareStyles(
  game: Chess,
  options: BoardHighlightOptions = {}
): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};

  const verbose = game.history({ verbose: true });
  if (verbose.length > 0) {
    const last = verbose[verbose.length - 1]!;
    setSquare(styles, last.from, LAST_MOVE_HIGHLIGHT);
    setSquare(styles, last.to, LAST_MOVE_HIGHLIGHT);
  }

  if (options.forceMoveFrom) {
    setSquare(styles, options.forceMoveFrom, FORCE_MOVE_HIGHLIGHT);
  }

  if (options.selectedSquare) {
    setSquare(styles, options.selectedSquare, SELECTED_HIGHLIGHT);
    const legal = game.moves({
      square: options.selectedSquare as never,
      verbose: true,
    });
    for (const m of legal) {
      setSquare(styles, m.to, m.captured ? LEGAL_CAPTURE_RING : LEGAL_MOVE_DOT);
    }
  }

  return styles;
}
