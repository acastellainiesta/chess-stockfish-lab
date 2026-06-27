"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";
import { AppHeader } from "../../components/AppHeader";
import { ToastStack } from "../../components/ToastStack";
import { useToasts } from "../../hooks/useToasts";
import { buildBoardSquareStyles } from "../../lib/boardSquareStyles";
import { playMoveSound, warmUpMoveSounds } from "../../lib/chessSounds";
import {
  getCurrentVariation,
  getOpening,
  isStillInOpeningBook,
  lookupBookSuggestion,
  OPENING_LIST,
  repertoireSideLabel,
  type OpeningId,
} from "../../lib/openings";
import styles from "../chess.module.css";

type GamePhase = "opening" | "midgame" | "endgame";
type EngineColor = "white" | "black";
type SuggestColor = "white" | "black" | "both";
type ContextMenuState = { x: number; y: number; square: string };

type EngineResult = {
  success: boolean;
  depth: number;
  bestMove: string | null;
  ponder: string | null;
  evaluation: number | null;
  mate: number | null;
  continuation: string | null;
  error?: string;
  fromBook?: boolean;
  bookVariation?: string;
  bookEco?: string;
  bookSan?: string;
  bookAlternativeLines?: { name: string; eco: string; continuation: string }[];
};

const PHASE_LABELS: Record<GamePhase, string> = {
  opening: "Opening",
  midgame: "Mid-game",
  endgame: "End-game",
};

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

export default function PlayPage() {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [phase, setPhase] = useState<GamePhase>("opening");
  const [suggestFor, setSuggestFor] = useState<SuggestColor>("both");
  const [autoMove, setAutoMove] = useState(false);
  const [orientation, setOrientation] = useState<EngineColor>("white");
  const [engine, setEngine] = useState<EngineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  const [selectedOpening, setSelectedOpening] = useState<OpeningId | null>(null);
  const [openingSearch, setOpeningSearch] = useState("");
  const [openingDropdownOpen, setOpeningDropdownOpen] = useState(false);
  const openingDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [forceMoveFrom, setForceMoveFrom] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const lastAutoAppliedRef = useRef<{ fen: string; bestMove: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const openingTrackRef = useRef({ inBook: false, variationId: "" });
  const { toasts, pushToast, dismissToast } = useToasts();

  const turn: EngineColor = gameRef.current.turn() === "w" ? "white" : "black";
  const isGameOver = gameRef.current.isGameOver();

  const filteredOpenings = useMemo(() => {
    const q = openingSearch.trim().toLowerCase();
    if (!q) return OPENING_LIST;
    return OPENING_LIST.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.ecoRange.toLowerCase().includes(q) ||
        o.entryMoves.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q)
    );
  }, [openingSearch]);

  const selectedOpeningDef = selectedOpening
    ? OPENING_LIST.find((o) => o.id === selectedOpening) ?? null
    : null;

  const selectOpening = useCallback((id: OpeningId | null) => {
    setSelectedOpening(id);
    setOpeningDropdownOpen(false);
    setOpeningSearch("");
  }, []);

  useEffect(() => {
    if (!openingDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!openingDropdownRef.current?.contains(e.target as Node)) {
        setOpeningDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openingDropdownOpen]);

  const syncFromGame = useCallback(() => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
  }, []);

  const variationToast = useCallback(
    (name: string) =>
      pushToast(`Detected ${name} variation, suggestion recalculated`, "info"),
    [pushToast]
  );

  useEffect(() => {
    if (!selectedOpening) {
      openingTrackRef.current = { inBook: false, variationId: "" };
      return;
    }
    const opening = getOpening(selectedOpening);
    if (!opening) return;

    const inBook = isStillInOpeningBook(opening, history);
    const variation = getCurrentVariation(opening, history);
    const varId = variation?.id ?? "";
    const prev = openingTrackRef.current;
    const minPly = 2;

    if (history.length >= minPly) {
      if (prev.inBook && !inBook) {
        pushToast("Left opening book — Stockfish suggestions resume", "warn");
      } else if (!prev.inBook && inBook && variation) {
        variationToast(variation.name);
      } else if (inBook && variation && varId && varId !== prev.variationId) {
        variationToast(variation.name);
      }
    }

    openingTrackRef.current = { inBook, variationId: varId };
  }, [history, selectedOpening, pushToast, variationToast]);

  useEffect(() => {
    openingTrackRef.current = { inBook: false, variationId: "" };
  }, [selectedOpening]);

  useEffect(() => {
    const sideToMove = gameRef.current.turn() === "w" ? "white" : "black";
    const wanted = suggestFor === "both" || suggestFor === sideToMove;

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

    const book = lookupBookSuggestion(selectedOpening, history, fen);
    if (book) {
      abortRef.current?.abort();
      setEngine({
        success: true,
        depth: 0,
        bestMove: book.uci,
        ponder: null,
        evaluation: null,
        mate: null,
        continuation: book.continuation,
        fromBook: true,
        bookVariation: book.variationName,
        bookEco: book.eco,
        bookSan: book.san,
        bookAlternativeLines: book.alternativeLines,
      });
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const depth = pickDepth(phase);
    setLoading(true);

    fetch(`/api/stockfish?fen=${encodeURIComponent(fen)}&depth=${depth}`, {
      signal: controller.signal,
    })
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
  }, [fen, phase, suggestionsEnabled, suggestFor, selectedOpening, history]);

  const attemptMove = useCallback(
    (from: string, to: string) => {
      try {
        const move = gameRef.current.move({ from, to, promotion: "q" });
        if (!move) return false;
        playMoveSound(move, gameRef.current);
        syncFromGame();
        setSelectedSquare(null);
        setRedoStack([]);
        return true;
      } catch {
        return false;
      }
    },
    [syncFromGame]
  );

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

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!targetSquare || isGameOver) return false;
      return attemptMove(sourceSquare, targetSquare);
    },
    [attemptMove, isGameOver]
  );

  const onSquareRightClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (!piece) return;
      setContextMenu({ x: pointerRef.current.x, y: pointerRef.current.y, square });
    },
    []
  );

  const onSquareClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (forceMoveFrom) {
        if (square !== forceMoveFrom) forceRelocate(forceMoveFrom, square);
        setForceMoveFrom(null);
        return;
      }

      if (isGameOver) return;

      if (!selectedSquare) {
        if (piece && piece.pieceType[0].toLowerCase() === gameRef.current.turn()) {
          setSelectedSquare(square);
        }
        return;
      }
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
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

  useEffect(() => {
    if (!autoMove || !suggestionsEnabled || loading || isGameOver || forceMoveFrom) return;
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
    setRedoStack((s) => [...s, undone.san]);
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

  const arrows: Arrow[] = [];
  if (engine?.bestMove && engine.bestMove.length >= 4) {
    arrows.push({
      startSquare: engine.bestMove.slice(0, 2),
      endSquare: engine.bestMove.slice(2, 4),
      color: "#22c55e",
    });
  }

  const squareStyles = buildBoardSquareStyles(gameRef.current, {
    selectedSquare,
    forceMoveFrom,
  });

  const suggestionWanted = suggestFor === "both" || suggestFor === turn;
  let statusText = `${PHASE_LABELS[phase]} · ${turn === "white" ? "White" : "Black"} to move`;
  if (gameRef.current.isCheckmate()) {
    statusText = `Checkmate — ${turn === "white" ? "Black" : "White"} wins`;
  } else if (gameRef.current.isDraw() || gameRef.current.isStalemate()) {
    statusText = "Draw";
  } else if (gameRef.current.inCheck()) {
    statusText += " · Check";
  }

  return (
    <main className={styles.page}>
      <AppHeader
        title="Analysis lab"
        subtitle="Play both sides, walk opening book lines, use Stockfish out of book, and edit the position freely."
      />

      <div className={styles.layout}>
        <section className={styles.boardWrap}>
          <div className={styles.statusBar} data-check={gameRef.current.inCheck()}>
            {statusText}
          </div>
          {forceMoveFrom && (
            <div className={styles.forceBanner}>
              Force move: click the destination square ·{" "}
              <button
                type="button"
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
                id: "play-board",
              }}
            />
          </div>
          <div className={styles.boardActions}>
            <button type="button" className={styles.btn} onClick={newGame}>
              New game
            </button>
            <button type="button" className={styles.btn} onClick={undo} disabled={history.length === 0}>
              Undo
            </button>
            <button type="button" className={styles.btn} onClick={redo} disabled={redoStack.length === 0}>
              Redo
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
            >
              Flip board
            </button>
          </div>
          <div className={styles.boardActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.confirmWhite}`}
              onClick={() => confirmEngineMove("white")}
              disabled={isGameOver || loading || turn !== "white" || !engine?.bestMove}
            >
              White confirm
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.confirmBlack}`}
              onClick={() => confirmEngineMove("black")}
              disabled={isGameOver || loading || turn !== "black" || !engine?.bestMove}
            >
              Black confirm
            </button>
          </div>
        </section>

        <aside className={styles.panel}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Opening</h2>
            <p className={styles.hint}>
              In book, suggestions come from mapped lines instead of Stockfish. Leave the
              line and Stockfish takes over.
            </p>
            <div className={styles.openingDropdown} ref={openingDropdownRef}>
              <button
                type="button"
                className={styles.openingDropdownTrigger}
                data-open={openingDropdownOpen}
                aria-expanded={openingDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => setOpeningDropdownOpen((open) => !open)}
              >
                <span className={styles.openingDropdownTriggerLabel}>
                  {selectedOpeningDef
                    ? `${selectedOpeningDef.name} (${selectedOpeningDef.ecoRange})`
                    : "None — Stockfish only"}
                </span>
                <span className={styles.openingDropdownChevron} aria-hidden>
                  ▼
                </span>
              </button>
              {openingDropdownOpen && (
                <div className={styles.openingDropdownPanel} role="listbox">
                  <input
                    type="search"
                    className={styles.openingSearch}
                    placeholder="Search openings…"
                    value={openingSearch}
                    onChange={(e) => setOpeningSearch(e.target.value)}
                    aria-label="Search openings"
                    autoFocus
                  />
                  <div className={styles.openingPickerList}>
                    <button
                      type="button"
                      className={styles.openingPickerNone}
                      data-selected={selectedOpening === null}
                      onClick={() => selectOpening(null)}
                    >
                      None — Stockfish only
                    </button>
                    {filteredOpenings.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={styles.openingPickerBtn}
                        data-selected={selectedOpening === o.id}
                        onClick={() => selectOpening(o.id as OpeningId)}
                      >
                        <span className={styles.openingPickerBtnTitle}>{o.name}</span>
                        <span className={styles.openingPickerBtnMeta}>
                          {o.ecoRange} · {o.entryMoves}
                        </span>
                      </button>
                    ))}
                    {filteredOpenings.length === 0 && (
                      <p className={styles.muted}>No openings match your search.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {selectedOpening && (
              <div className={styles.openingMeta}>
                {(() => {
                  const o = OPENING_LIST.find((x) => x.id === selectedOpening)!;
                  return (
                    <>
                      <p className={styles.openingSide}>{repertoireSideLabel(o)}</p>
                      <p className={styles.openingEntry}>
                        Entry: <code>{o.entryMoves}</code>
                      </p>
                      <p className={styles.openingDesc}>{o.description}</p>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Game phase</h2>
            <p className={styles.hint}>Stockfish depth when out of opening book.</p>
            <div className={styles.segmented}>
              {(Object.keys(PHASE_LABELS) as GamePhase[]).map((p) => (
                <button
                  key={p}
                  type="button"
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
              <h2 className={styles.cardTitle}>Suggestions</h2>
              {loading && <span className={styles.spinner} aria-label="loading" />}
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={suggestionsEnabled}
                onChange={(e) => setSuggestionsEnabled(e.target.checked)}
              />
              <span>
                Suggest the next move
                {selectedOpening ? " (book or Stockfish)" : " with Stockfish"}
              </span>
            </label>
            {!suggestionsEnabled ? (
              <p className={styles.muted}>Suggestions are off.</p>
            ) : isGameOver ? (
              <p className={styles.muted}>Game over.</p>
            ) : !suggestionWanted ? (
              <p className={styles.muted}>
                Suggestions set to {suggestFor === "white" ? "White" : "Black"} only.
              </p>
            ) : engine?.error ? (
              <p className={styles.error}>{engine.error}</p>
            ) : engine ? (
              <div className={styles.analysis}>
                <div className={styles.bestMove} data-highlight={true}>
                  <span className={styles.bestMoveLabel}>
                    {engine.fromBook
                      ? `Book move · ${engine.bookVariation ?? "Opening"}`
                      : `Play this for ${turn === "white" ? "White" : "Black"}`}
                  </span>
                  <span className={styles.bestMoveValue}>
                    {engine.fromBook
                      ? (engine.bookSan ?? engine.bestMove ?? "—")
                      : (engine.bestMove ?? "—")}
                  </span>
                </div>
                <dl className={styles.stats}>
                  {engine.fromBook ? (
                    <>
                      <div>
                        <dt>Source</dt>
                        <dd>Opening book</dd>
                      </div>
                      <div>
                        <dt>ECO</dt>
                        <dd>{engine.bookEco ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>UCI</dt>
                        <dd>{engine.bestMove ?? "—"}</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>Eval</dt>
                        <dd>
                          {engine.mate !== null
                            ? `M${Math.abs(engine.mate)}`
                            : engine.evaluation !== null
                              ? `${engine.evaluation > 0 ? "+" : ""}${engine.evaluation}`
                              : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Depth</dt>
                        <dd>{engine.depth}</dd>
                      </div>
                      <div>
                        <dt>Ponder</dt>
                        <dd>{engine.ponder ?? "—"}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {engine.continuation && (
                  <div className={styles.continuation}>
                    <span className={styles.contLabel}>
                      {engine.fromBook ? "Book line" : "Top line"}
                    </span>
                    <code>{engine.continuation}</code>
                  </div>
                )}
                {engine.fromBook &&
                  engine.bookAlternativeLines?.map((alt) => (
                    <div key={`${alt.name}-${alt.continuation}`} className={styles.continuation}>
                      <span className={styles.contLabel}>
                        {alt.name} ({alt.eco})
                      </span>
                      <code>{alt.continuation}</code>
                    </div>
                  ))}
              </div>
            ) : (
              <p className={styles.muted}>Waiting for analysis…</p>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Suggestions for</h2>
            <p className={styles.hint}>Limit engine calls to one colour to reduce rate limits.</p>
            <div className={styles.segmented}>
              {(["white", "black", "both"] as SuggestColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={styles.segment}
                  data-active={suggestFor === c}
                  onClick={() => setSuggestFor(c)}
                >
                  {c === "white" ? "White" : c === "black" ? "Black" : "Both"}
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
              <span>Auto-play suggested move</span>
            </label>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Force turn</h2>
            <p className={styles.hint}>Set side to move without playing a move.</p>
            <div className={styles.segmented}>
              {(["white", "black"] as EngineColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={styles.segment}
                  data-active={turn === c}
                  onClick={() => setTurnTo(c)}
                >
                  {c === "white" ? "White" : "Black"}
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
                    {i % 2 === 0 && <span className={styles.moveNo}>{i / 2 + 1}.</span>}
                    {san}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

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
              type="button"
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
              type="button"
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
