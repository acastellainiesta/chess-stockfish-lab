import type { Chess, Move } from "chess.js";

export type MoveSoundKind =
  | "move"
  | "capture"
  | "check"
  | "castle"
  | "promote"
  | "game-end";

const MOVE_SOUND = "/sounds/move.mp3";
const CAPTURE_SOUND = "/sounds/capture.mp3";

const cache = new Map<string, HTMLAudioElement>();

function resolvePath(kind: MoveSoundKind): string {
  return kind === "capture" ? CAPTURE_SOUND : MOVE_SOUND;
}

function getAudio(path: string): HTMLAudioElement {
  let audio = cache.get(path);
  if (!audio) {
    audio = new Audio(path);
    audio.preload = "auto";
    cache.set(path, audio);
  }
  return audio;
}

/** Preload sounds after the first board interaction (browser autoplay policy). */
export function warmUpMoveSounds() {
  if (typeof window === "undefined") return;
  for (const kind of ["move", "capture"] as MoveSoundKind[]) {
    getAudio(resolvePath(kind)).load();
  }
}

function playPath(path: string) {
  if (typeof window === "undefined") return;
  const base = getAudio(path);
  const audio = base.cloneNode() as HTMLAudioElement;
  audio.volume = 0.85;
  void audio.play().catch(() => {
    // Ignore autoplay blocks until the user interacts with the board.
  });
}

export function soundKindForMove(move: Move, game: Chess): MoveSoundKind {
  if (game.isGameOver()) return "game-end";
  if (move.isCapture()) return "capture";
  if (game.inCheck()) return "check";
  if (move.isPromotion()) return "promote";
  if (move.isKingsideCastle() || move.isQueensideCastle()) return "castle";
  return "move";
}

export function playMoveSound(move: Move, game: Chess) {
  const kind = soundKindForMove(move, game);
  playPath(resolvePath(kind));
}
