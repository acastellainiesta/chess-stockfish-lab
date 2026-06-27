"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";
import styles from "./page.module.css";
import { playMoveSound, warmUpMoveSounds } from "../lib/chessSounds";

type ContextMenuState = { x: number; y: number; square: string };

type GamePhase = "opening" | "midgame" | "endgame";
type EngineColor = "white" | "black";
type SuggestColor = "white" | "black" | "both";

type EngineResult = {
  success: boolean;
  depth: number;
  bestMove: string | null;
  ponder: string | null;
  evaluation: number | null;
  mate: number | null;
  continuation: string | null;
  error?: string;
};

const PHASE_LABELS: Record<GamePhase, string> = {
  opening: "Opening",
  midgame: "Mid-game",
  endgame: "End-game",
};

// Depth ranges per phase (API accepts 5-15); a fresh value is drawn on every
// engine call, randomized within the phase's range.
const PHASE_DEPTHS: Record<GamePhase, number[]> = {
  opening: [5, 6, 7],
  midgame: [8, 9, 10],
  endgame: [11, 12, 13, 14, 15],
};

function pickDepth(phase: GamePhase): number {
  const options = PHASE_DEPTHS[phase];
  return options[Math.floor(Math.random() * options.length)];
}

function describeDepth(phase: GamePhase): string {
  const options = PHASE_DEPTHS[phase];
  return options.length === 1 ? `${options[0]}` : options.join(" / ");
}

export default function Home() {
  // The single source of truth for the game lives in this ref; `fen` mirrors it
  // into React state so the board and engine react to every move.
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [history, setHistory] = useState<string[]>([]);

  const [phase, setPhase] = useState<GamePhase>("opening");
  // Which colour(s) we actually request suggestions for. Limiting this to a
  // single colour roughly halves the number of API calls, which avoids the
  // StockfishOnline rate limit (HTTP 429) during quick back-and-forth play.
  const [suggestFor, setSuggestFor] = useState<SuggestColor>("both");
  const [autoMove, setAutoMove] = useState(false);
  const lastAutoAppliedRef = useRef<{ fen: string; bestMove: string } | null>(null);
  const [orientation, setOrientation] = useState<EngineColor>("white");

  const [engine, setEngine] = useState<EngineResult | null>(null);
  const [loading, setLoading] = useState(false);
  // Whether Stockfish should be queried and its suggestion shown.
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);

  // Click-to-move: the first click selects a piece, the second click moves it.
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  // Moves removed via Undo, stored as SAN so they can be replayed by Redo.
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // Right-click board editing: context menu + "force move" pick-up state.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [forceMoveFrom, setForceMoveFrom] = useState<string | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const abortRef = useRef<AbortController | null>(null);

  const turn: EngineColor = gameRef.current.turn() === "w" ? "white" : "black";
  const isGameOver = gameRef.current.isGameOver();

  const syncFromGame = useCallback(() => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
  }, []);

  // Ask Stockfish for the best move whenever the position or phase changes.
  useEffect(() => {
    const sideToMove = gameRef.current.turn() === "w" ? "white" : "black";
    const wanted = suggestFor === "both" || suggestFor === sideToMove;

    // Skip the API call entirely when suggestions are off or this colour's
    // turn isn't one we're asking about — this is what keeps us under the limit.
    if (!suggestionsEnabled || !wanted) {
      abortRef.current?.abort();
      setEngine(null);
      setLoading(false);
      return;
    }

    if (gameRef.current.isGameOver()) {
      setEngine(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const depth = pickDepth(phase);
    setLoading(true);

    fetch(
      `/api/stockfish?fen=${encodeURIComponent(fen)}&depth=${depth}`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((data: EngineResult) => {
        if (!controller.signal.aborted) setEngine(data);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setEngine({
            success: false,
            depth,
            bestMove: null,
            ponder: null,
            evaluation: null,
            mate: null,
            continuation: null,
            error: "Could not reach the Stockfish service.",
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [fen, phase, suggestionsEnabled, suggestFor]);

  // Shared move executor used by both drag-and-drop and click-to-move.
  const attemptMove = useCallback(
    (from: string, to: string) => {
      try {
        const move = gameRef.current.move({ from, to, promotion: "q" });
        if (!move) return false;
        playMoveSound(move, gameRef.current);
        syncFromGame();
        setSelectedSquare(null);
        // A new forward move invalidates any moves that were undone.
        setRedoStack([]);
        return true;
      } catch {
        return false;
      }
    },
    [syncFromGame]
  );

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!targetSquare) return false;
      return attemptMove(sourceSquare, targetSquare);
    },
    [attemptMove]
  );

  // Free board edits below ignore turn order and legality on purpose; they are
  // analysis tools, so they bypass chess.js move validation via put/remove.

  // Move a piece to any square regardless of whose turn it is or legality.
  const forceRelocate = useCallback(
    (from: string, to: string) => {
      const piece = gameRef.current.get(from as Square);
      if (!piece) return;
      gameRef.current.remove(from as Square);
      gameRef.current.remove(to as Square);
      gameRef.current.put({ type: piece.type, color: piece.color }, to as Square);
      syncFromGame();
      setRedoStack([]);
      setSelectedSquare(null);
    },
    [syncFromGame]
  );

  const removePiece = useCallback(
    (square: string) => {
      gameRef.current.remove(square as Square);
      syncFromGame();
      setRedoStack([]);
      setSelectedSquare(null);
    },
    [syncFromGame]
  );

  // Force whose turn it is (white or black) without making a move. We edit the
  // FEN directly (and clear the en-passant target) instead of using setTurn,
  // which refuses to flip the side to move while the current side is in check.
  const setTurnTo = useCallback(
    (color: EngineColor) => {
      const parts = gameRef.current.fen().split(" ");
      parts[1] = color === "white" ? "w" : "b";
      parts[3] = "-";
      gameRef.current.load(parts.join(" "), { skipValidation: true });
      syncFromGame();
      setRedoStack([]);
    },
    [syncFromGame]
  );

  const onSquareRightClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (!piece) return;
      setContextMenu({ x: pointerRef.current.x, y: pointerRef.current.y, square });
    },
    []
  );

  // Click-to-move: select a piece, then click a destination square.
  const onSquareClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      // "Force move" mode: the next click is the destination, anything goes.
      if (forceMoveFrom) {
        if (square !== forceMoveFrom) forceRelocate(forceMoveFrom, square);
        setForceMoveFrom(null);
        return;
      }

      if (isGameOver) return;

      // No piece selected yet — only select one of the side-to-move's pieces.
      if (!selectedSquare) {
        if (piece && piece.pieceType[0].toLowerCase() === gameRef.current.turn()) {
          setSelectedSquare(square);
        }
        return;
      }

      // Clicking the already-selected square deselects it.
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }

      // Try the move; if illegal, treat the click as selecting a new piece.
      if (!attemptMove(selectedSquare, square)) {
        if (piece && piece.pieceType[0].toLowerCase() === gameRef.current.turn()) {
          setSelectedSquare(square);
        } else {
          setSelectedSquare(null);
        }
      }
    },
    [attemptMove, forceMoveFrom, forceRelocate, isGameOver, selectedSquare]
  );

  // Auto-play the engine's suggested move for the given colour. Only valid when
  // it is that colour's turn, since the suggestion is always for the side to move.
  const confirmEngineMove = useCallback(
    (color: EngineColor) => {
      const sideToMove = gameRef.current.turn() === "w" ? "white" : "black";
      if (sideToMove !== color) return;
      const best = engine?.bestMove;
      if (!best || best.length < 4) return;
      attemptMove(best.slice(0, 2), best.slice(2, 4));
    },
    [attemptMove, engine]
  );

  // When auto-move is on, play the engine line as soon as a suggestion arrives
  // for a colour we're requesting — same effect as pressing White/Black confirm.
  useEffect(() => {
    if (!autoMove || !suggestionsEnabled || loading || isGameOver || forceMoveFrom) {
      return;
    }

    const sideToMove = gameRef.current.turn() === "w" ? "white" : "black";
    if (suggestFor !== "both" && suggestFor !== sideToMove) return;

    const best = engine?.bestMove;
    if (!best || best.length < 4 || engine.error) return;

    const applied = { fen, bestMove: best };
    if (
      lastAutoAppliedRef.current?.fen === applied.fen &&
      lastAutoAppliedRef.current?.bestMove === applied.bestMove
    ) {
      return;
    }

    const ok = attemptMove(best.slice(0, 2), best.slice(2, 4));
    if (ok) lastAutoAppliedRef.current = applied;
  }, [
    autoMove,
    suggestionsEnabled,
    engine,
    loading,
    fen,
    suggestFor,
    isGameOver,
    forceMoveFrom,
    attemptMove,
  ]);

  const newGame = useCallback(() => {
    gameRef.current = new Chess();
    syncFromGame();
    setEngine(null);
    setSelectedSquare(null);
    setRedoStack([]);
    setForceMoveFrom(null);
    setContextMenu(null);
    lastAutoAppliedRef.current = null;
  }, [syncFromGame]);

  const undo = useCallback(() => {
    const undone = gameRef.current.undo();
    if (!undone) return;
    setRedoStack((stack) => [...stack, undone.san]);
    syncFromGame();
    setSelectedSquare(null);
    lastAutoAppliedRef.current = null;
  }, [syncFromGame]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const san = stack[stack.length - 1];
      try {
        const move = gameRef.current.move(san);
        if (move) playMoveSound(move, gameRef.current);
        syncFromGame();
        setSelectedSquare(null);
        return stack.slice(0, -1);
      } catch {
        return stack;
      }
    });
  }, [syncFromGame]);

  // Draw the engine's best move as an arrow. We only ever fetch a suggestion for
  // a colour we asked about, so when one exists it is always a wanted move.
  const arrows: Arrow[] = [];
  if (engine?.bestMove && engine.bestMove.length >= 4) {
    arrows.push({
      startSquare: engine.bestMove.slice(0, 2),
      endSquare: engine.bestMove.slice(2, 4),
      color: "#22c55e",
    });
  }

  // Highlight the selected square and its legal destinations for click-to-move.
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (forceMoveFrom) {
    squareStyles[forceMoveFrom] = {
      background: "rgba(239, 68, 68, 0.5)",
      boxShadow: "inset 0 0 0 3px #ef4444",
    };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      background: "rgba(234, 88, 12, 0.45)",
    };
    const legal = gameRef.current.moves({ square: selectedSquare as never, verbose: true });
    for (const m of legal) {
      const isCapture = Boolean((m as { captured?: string }).captured);
      squareStyles[m.to] = isCapture
        ? {
            background:
              "radial-gradient(circle, transparent 55%, rgba(234,88,12,0.55) 56%)",
          }
        : {
            background:
              "radial-gradient(circle, rgba(234,88,12,0.55) 22%, transparent 23%)",
          };
    }
  }

  // Whether the colour to move is one we're requesting suggestions for.
  const suggestionWanted = suggestFor === "both" || suggestFor === turn;

  let statusText = `${PHASE_LABELS[phase]} · ${turn === "white" ? "White" : "Black"} to move`;
  if (gameRef.current.isCheckmate()) {
    statusText = `Checkmate — ${turn === "white" ? "Black" : "White"} wins`;
  } else if (gameRef.current.isDraw()) {
    statusText = "Draw";
  } else if (gameRef.current.isStalemate()) {
    statusText = "Stalemate";
  } else if (gameRef.current.inCheck()) {
    statusText += " · Check";
  }

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <section className={styles.boardWrap}>
          <div className={styles.statusBar} data-check={gameRef.current.inCheck()}>
            {statusText}
          </div>
          {forceMoveFrom && (
            <div className={styles.forceBanner}>
              Force move: click the destination square ·{" "}
              <button
                className={styles.linkBtn}
                onClick={() => setForceMoveFrom(null)}
              >
                cancel
              </button>
            </div>
          )}
          <div
            className={styles.board}
            onMouseDown={(e) => {
              pointerRef.current = { x: e.clientX, y: e.clientY };
              warmUpMoveSounds();
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Chessboard
              options={{
                position: fen,
                onPieceDrop,
                onSquareClick,
                onSquareRightClick,
                squareStyles,
                boardOrientation: orientation,
                arrows,
                allowDragging: !isGameOver,
                animationDurationInMs: 200,
                darkSquareStyle: { backgroundColor: "#b58863" },
                lightSquareStyle: { backgroundColor: "#f0d9b5" },
                id: "main-board",
              }}
            />
          </div>
          <div className={styles.boardActions}>
            <button className={styles.btn} onClick={newGame}>
              New game
            </button>
            <button
              className={styles.btn}
              onClick={undo}
              disabled={history.length === 0}
            >
              Undo
            </button>
            <button
              className={styles.btn}
              onClick={redo}
              disabled={redoStack.length === 0}
            >
              Redo
            </button>
            <button
              className={styles.btn}
              onClick={() =>
                setOrientation((o) => (o === "white" ? "black" : "white"))
              }
            >
              Flip board
            </button>
          </div>

          <div className={styles.boardActions}>
            <button
              className={`${styles.btn} ${styles.confirmWhite}`}
              onClick={() => confirmEngineMove("white")}
              disabled={
                isGameOver ||
                loading ||
                turn !== "white" ||
                !engine?.bestMove
              }
              title="Auto-play Stockfish's suggested move for White"
            >
              White confirm
            </button>
            <button
              className={`${styles.btn} ${styles.confirmBlack}`}
              onClick={() => confirmEngineMove("black")}
              disabled={
                isGameOver ||
                loading ||
                turn !== "black" ||
                !engine?.bestMove
              }
              title="Auto-play Stockfish's suggested move for Black"
            >
              Black confirm
            </button>
          </div>
        </section>

        <aside className={styles.panel}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Game phase</h2>
            <p className={styles.hint}>
              Controls the Stockfish search depth on every call.
            </p>
            <div className={styles.segmented}>
              {(Object.keys(PHASE_LABELS) as GamePhase[]).map((p) => (
                <button
                  key={p}
                  className={styles.segment}
                  data-active={phase === p}
                  onClick={() => setPhase(p)}
                >
                  <span>{PHASE_LABELS[p]}</span>
                  <small>depth {describeDepth(p)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitleRow}>
              <h2 className={styles.cardTitle}>Engine analysis</h2>
              {loading && <span className={styles.spinner} aria-label="loading" />}
            </div>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={suggestionsEnabled}
                onChange={(e) => setSuggestionsEnabled(e.target.checked)}
              />
              <span>Suggest the next move with Stockfish</span>
            </label>

            {!suggestionsEnabled ? (
              <p className={styles.muted}>
                Suggestions are off. Enable them to get Stockfish analysis.
              </p>
            ) : isGameOver ? (
              <p className={styles.muted}>The game is over — no analysis.</p>
            ) : !suggestionWanted ? (
              <p className={styles.muted}>
                Suggestions are set to{" "}
                {suggestFor === "white" ? "White" : "Black"} only — it&apos;s{" "}
                {turn === "white" ? "White" : "Black"}&apos;s move, so no call is
                made.
              </p>
            ) : engine?.error ? (
              <p className={styles.error}>{engine.error}</p>
            ) : engine ? (
              <div className={styles.analysis}>
                <div className={styles.bestMove} data-highlight={true}>
                  <span className={styles.bestMoveLabel}>
                    {`★ Play this for ${turn === "white" ? "White" : "Black"}`}
                  </span>
                  <span className={styles.bestMoveValue}>
                    {engine.bestMove ?? "—"}
                  </span>
                </div>

                <dl className={styles.stats}>
                  <div>
                    <dt>Evaluation</dt>
                    <dd>
                      {engine.mate !== null
                        ? `Mate in ${Math.abs(engine.mate)}`
                        : engine.evaluation !== null
                        ? `${engine.evaluation > 0 ? "+" : ""}${engine.evaluation}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Depth used</dt>
                    <dd>{engine.depth}</dd>
                  </div>
                  <div>
                    <dt>Ponder</dt>
                    <dd>{engine.ponder ?? "—"}</dd>
                  </div>
                </dl>

                {engine.continuation && (
                  <div className={styles.continuation}>
                    <span className={styles.contLabel}>Top line</span>
                    <code>{engine.continuation}</code>
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.muted}>Make a move to get analysis.</p>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Suggestions for</h2>
            <p className={styles.hint}>
              Limit which colour gets engine calls. Picking one colour halves the
              requests and helps avoid rate limits (HTTP 429) if you are playing too fast.
            </p>
            <div className={styles.segmented}>
              {(["white", "black", "both"] as SuggestColor[]).map((c) => (
                <button
                  key={c}
                  className={styles.segment}
                  data-active={suggestFor === c}
                  onClick={() => setSuggestFor(c)}
                >
                  <span>
                    {c === "white" ? "White" : c === "black" ? "Black" : "Both"}
                  </span>
                </button>
              ))}
            </div>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={autoMove}
                onChange={(e) => {
                  setAutoMove(e.target.checked);
                  if (!e.target.checked) lastAutoAppliedRef.current = null;
                }}
              />
              <span>Auto-move (automatically play the suggested move)</span>
            </label>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Force turn</h2>
            <p className={styles.hint}>
              Set which colour is to move now, without making a move.
            </p>
            <div className={styles.segmented}>
              {(["white", "black"] as EngineColor[]).map((c) => (
                <button
                  key={c}
                  className={styles.segment}
                  data-active={turn === c}
                  onClick={() => setTurnTo(c)}
                >
                  <span>{c === "white" ? "White" : "Black"}</span>
                </button>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Moves</h2>
              <ol className={styles.moveList}>
                {history.map((san, i) => (
                  <li key={i}>
                    {i % 2 === 0 && (
                      <span className={styles.moveNo}>{i / 2 + 1}.</span>
                    )}
                    {san}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>

      {contextMenu && (
        <>
          <div
            className={styles.menuOverlay}
            onMouseDown={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className={styles.contextMenu}
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className={styles.contextHeader}>{contextMenu.square}</div>
            <button
              className={styles.contextItem}
              onClick={() => {
                setForceMoveFrom(contextMenu.square);
                setSelectedSquare(null);
                setContextMenu(null);
              }}
            >
              Force move
            </button>
            <button
              className={styles.contextItem}
              onClick={() => {
                removePiece(contextMenu.square);
                setContextMenu(null);
              }}
            >
              Remove piece
            </button>
          </div>
        </>
      )}
    </main>
  );
}
