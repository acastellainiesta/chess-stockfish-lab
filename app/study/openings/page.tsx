"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";
import { AppHeader } from "../../../components/AppHeader";
import { ToastStack } from "../../../components/ToastStack";
import { useToasts } from "../../../hooks/useToasts";
import { buildBoardSquareStyles } from "../../../lib/boardSquareStyles";
import { playMoveSound, warmUpMoveSounds } from "../../../lib/chessSounds";
import {
  formatLinePreview,
  getLineById,
  getStudySuggestion,
  isLineComplete,
  OPENING_LIST,
  repertoireSideLabel,
  validateStudyMove,
  type OpeningId,
  type OpeningLine,
  type StudyColor,
} from "../../../lib/openings";
import chessStyles from "../../chess.module.css";
import styles from "../study.module.css";

type WizardStep = "opening" | "variation" | "settings";

type SessionConfig = {
  openingId: OpeningId;
  lineId: string;
  userColor: StudyColor;
  showSuggestions: boolean;
};

export default function OpeningStudyPage() {
  const [step, setStep] = useState<WizardStep>("opening");
  const [openingId, setOpeningId] = useState<OpeningId | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [variationSearch, setVariationSearch] = useState("");
  const [session, setSession] = useState<SessionConfig | null>(null);

  const opening = openingId ? OPENING_LIST.find((o) => o.id === openingId) ?? null : null;
  const selectedLine =
    opening && lineId ? getLineById(opening, lineId) : null;

  const filteredLines = useMemo(() => {
    if (!opening) return [];
    const q = variationSearch.trim().toLowerCase();
    if (!q) return opening.lines;
    return opening.lines.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.eco.toLowerCase().includes(q) ||
        l.moves.join(" ").toLowerCase().includes(q)
    );
  }, [opening, variationSearch]);

  const pickOpening = (id: OpeningId) => {
    setOpeningId(id);
    setLineId(null);
    setStep("variation");
  };

  const pickVariation = (line: OpeningLine) => {
    setLineId(line.id);
    setStep("settings");
  };

  const startSession = () => {
    if (!openingId || !lineId || !opening) return;
    setSession({
      openingId,
      lineId,
      userColor: opening.repertoireSide,
      showSuggestions,
    });
  };

  const exitSession = () => {
    setSession(null);
    setStep("settings");
  };

  if (session && opening) {
    const line = getLineById(opening, session.lineId);
    if (!line) {
      setSession(null);
      return null;
    }
    return (
      <OpeningStudySession
        openingName={opening.name}
        line={line}
        userColor={session.userColor}
        showSuggestions={session.showSuggestions}
        onExit={exitSession}
      />
    );
  }

  return (
    <main className={chessStyles.page}>
      <AppHeader
        title="Opening study"
        subtitle="Choose an opening, pick the exact variation to train against, then practice while the opponent follows the book."
      />

      <div className={styles.wizard}>
        <div className={styles.steps}>
          <span className={styles.step} data-active={step === "opening"} data-done={step !== "opening"}>
            1. Opening
          </span>
          <span
            className={styles.step}
            data-active={step === "variation"}
            data-done={step === "settings"}
          >
            2. Variation
          </span>
          <span className={styles.step} data-active={step === "settings"}>
            3. Options
          </span>
        </div>

        {step === "opening" && (
          <div className={chessStyles.card}>
            <h2 className={chessStyles.cardTitle}>Select opening</h2>
            <p className={chessStyles.hint}>
              Each opening includes dozens of mapped lines from the repertoire database.
            </p>
            <div className={styles.openingGrid}>
              {OPENING_LIST.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={styles.openingBtn}
                  data-selected={openingId === o.id}
                  onClick={() => pickOpening(o.id as OpeningId)}
                >
                  <span className={styles.openingBtnTitle}>{o.name}</span>
                  <span className={styles.openingBtnMeta}>
                    {o.ecoRange} · {repertoireSideLabel(o)} · {o.lines.length} lines
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "variation" && opening && (
          <div className={chessStyles.card}>
            <h2 className={chessStyles.cardTitle}>Select variation</h2>
            <p className={chessStyles.hint}>
              Training against <strong>{opening.name}</strong>. The engine opponent will
              play the other side of this exact line.
            </p>
            <input
              type="search"
              className={styles.search}
              placeholder="Search by name, ECO, or moves…"
              value={variationSearch}
              onChange={(e) => setVariationSearch(e.target.value)}
            />
            <div className={styles.variationList}>
              {filteredLines.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={styles.variationBtn}
                  data-selected={lineId === l.id}
                  onClick={() => pickVariation(l)}
                >
                  <span className={styles.variationName}>
                    {l.name} <span className={chessStyles.tag}>{l.eco}</span>
                  </span>
                  <span className={styles.variationPreview}>{formatLinePreview(l, 10)}</span>
                </button>
              ))}
              {filteredLines.length === 0 && (
                <p className={chessStyles.muted}>No variations match your search.</p>
              )}
            </div>
            <div className={styles.actions}>
              <button type="button" className={chessStyles.btn} onClick={() => setStep("opening")}>
                Back
              </button>
            </div>
          </div>
        )}

        {step === "settings" && opening && selectedLine && (
          <div className={chessStyles.card}>
            <h2 className={chessStyles.cardTitle}>Study options</h2>
            <p className={chessStyles.hint}>
              Variation: <strong>{selectedLine.name}</strong> ({selectedLine.eco})
            </p>
            <div className={styles.fullLine}>{selectedLine.moves.join(" ")}</div>

            <h3 className={chessStyles.cardTitle} style={{ marginTop: 16 }}>
              Your colour
            </h3>
            <p className={chessStyles.hint}>
              You train as{" "}
              <strong>{opening.repertoireSide === "white" ? "White" : "Black"}</strong> —{" "}
              {repertoireSideLabel(opening).replace(" · walk lines as both colours", "")}.
              The opponent plays the other side from the book.
            </p>

            <label className={chessStyles.toggle} style={{ marginTop: 14 }}>
              <input
                type="checkbox"
                checked={showSuggestions}
                onChange={(e) => setShowSuggestions(e.target.checked)}
              />
              <span>Show line suggestions (book moves and continuations)</span>
            </label>
            {!showSuggestions && (
              <p className={chessStyles.hint}>
                Suggestions off — your moves are still checked. Wrong moves are rejected
                with an explanation of the correct book move.
              </p>
            )}

            <div className={styles.actions}>
              <button type="button" className={chessStyles.btn} onClick={() => setStep("variation")}>
                Back
              </button>
              <button type="button" className={chessStyles.btnPrimary} onClick={startSession}>
                Start training
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

type SessionProps = {
  openingName: string;
  line: OpeningLine;
  userColor: StudyColor;
  showSuggestions: boolean;
  onExit: () => void;
};

function OpeningStudySession({
  openingName,
  line,
  userColor,
  showSuggestions,
  onExit,
}: SessionProps) {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const opponentBusyRef = useRef(false);
  const [opponentBusy, setOpponentBusy] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();

  const syncFromGame = useCallback(() => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
  }, []);

  const opponentColor: StudyColor = userColor === "white" ? "black" : "white";
  const turn: StudyColor = gameRef.current.turn() === "w" ? "white" : "black";
  const isUserTurn = turn === userColor;
  const complete = isLineComplete(line, history);
  const progress = Math.min(100, Math.round((history.length / line.moves.length) * 100));

  const studySuggestion = showSuggestions
    ? getStudySuggestion(line, history, fen, userColor)
    : null;

  const attemptMove = useCallback(
    (from: string, to: string) => {
      try {
        const move = gameRef.current.move({ from, to, promotion: "q" });
        if (!move) return false;
        playMoveSound(move, gameRef.current);
        syncFromGame();
        setSelectedSquare(null);
        return true;
      } catch {
        return false;
      }
    },
    [syncFromGame]
  );

  const attemptUserMove = useCallback(
    (from: string, to: string) => {
      if (opponentBusyRef.current || complete) return false;
      if (!isUserTurn) {
        pushToast("Wait for the opponent's move from the training line.", "warn");
        return false;
      }

      const probe = new Chess(gameRef.current.fen());
      let probeMove;
      try {
        probeMove = probe.move({ from, to, promotion: "q" });
      } catch {
        return false;
      }
      if (!probeMove) return false;

      const validation = validateStudyMove(line, history, probeMove.san);
      if (!validation.valid) {
        pushToast(validation.message, "warn");
        return false;
      }

      const ok = attemptMove(from, to);
      if (ok) {
        pushToast(
          validation.lineComplete
            ? `Variation complete! You finished ${line.name} (${line.eco}).`
            : `Correct — ${probeMove.san} matches the book.`,
          validation.lineComplete ? "success" : "info"
        );
      }
      return ok;
    },
    [attemptMove, complete, history, isUserTurn, line, pushToast]
  );

  // Auto-play opponent moves from the training line.
  useEffect(() => {
    if (complete || opponentBusyRef.current) return;

    const ply = history.length;
    if (ply >= line.moves.length) return;

    const sideToMove = gameRef.current.turn() === "w" ? "white" : "black";
    if (sideToMove === userColor) return;

    const san = line.moves[ply]!;
    opponentBusyRef.current = true;
    setOpponentBusy(true);

    const timer = setTimeout(() => {
      try {
        const currentPly = gameRef.current.history().length;
        if (currentPly !== ply) return;

        const move = gameRef.current.move(san);
        if (move) {
          playMoveSound(move, gameRef.current);
          syncFromGame();
        }
      } catch {
        pushToast(`Could not play opponent move ${san} from the line.`, "warn");
      } finally {
        opponentBusyRef.current = false;
        setOpponentBusy(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      opponentBusyRef.current = false;
      setOpponentBusy(false);
    };
  }, [history, line, userColor, complete, syncFromGame, pushToast]);

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!targetSquare || complete) return false;
      return attemptUserMove(sourceSquare, targetSquare);
    },
    [attemptUserMove, complete]
  );

  const onSquareClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (complete || opponentBusyRef.current) return;
      if (!isUserTurn) return;

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
      if (!attemptUserMove(selectedSquare, square)) {
        if (piece && piece.pieceType[0].toLowerCase() === gameRef.current.turn()) {
          setSelectedSquare(square);
        } else {
          setSelectedSquare(null);
        }
      }
    },
    [attemptUserMove, complete, isUserTurn, selectedSquare]
  );

  const resetLine = useCallback(() => {
    gameRef.current = new Chess();
    syncFromGame();
    setSelectedSquare(null);
    opponentBusyRef.current = false;
    setOpponentBusy(false);
    pushToast("Line reset — starting from move 1.", "info");
  }, [pushToast, syncFromGame]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    gameRef.current.undo();
    if (history.length > 1 && gameRef.current.turn() !== (userColor === "white" ? "w" : "b")) {
      gameRef.current.undo();
    }
    syncFromGame();
    setSelectedSquare(null);
  }, [history.length, syncFromGame, userColor]);

  const arrows: Arrow[] = [];
  if (studySuggestion?.uci) {
    arrows.push({
      startSquare: studySuggestion.uci.slice(0, 2),
      endSquare: studySuggestion.uci.slice(2, 4),
      color: "#22c55e",
    });
  }

  const squareStyles = buildBoardSquareStyles(gameRef.current, {
    selectedSquare: isUserTurn ? selectedSquare : null,
  });

  let statusText = complete
    ? `Complete — ${line.name}`
    : opponentBusy
      ? `Opponent (${opponentColor}) is moving…`
      : isUserTurn
        ? `Your move (${userColor})`
        : `Opponent (${opponentColor}) to move`;

  return (
    <main className={chessStyles.page}>
      <AppHeader
        title="Opening study"
        subtitle={`${openingName} · ${line.name} (${line.eco})`}
      />

      <div className={chessStyles.layout}>
        <section className={chessStyles.boardWrap}>
          <div
            className={chessStyles.statusBar}
            data-check={gameRef.current.inCheck()}
            data-mode="study"
          >
            {statusText}
          </div>
          <div
            className={chessStyles.board}
            onMouseDown={() => warmUpMoveSounds()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Chessboard
              options={{
                position: fen,
                onPieceDrop,
                onSquareClick,
                squareStyles,
                boardOrientation: userColor,
                arrows,
                allowDragging: isUserTurn && !complete && !opponentBusy,
                animationDurationInMs: 200,
                darkSquareStyle: { backgroundColor: "#b58863" },
                lightSquareStyle: { backgroundColor: "#f0d9b5" },
                id: "study-board",
              }}
            />
          </div>
          <div className={chessStyles.boardActions}>
            <button type="button" className={chessStyles.btn} onClick={resetLine}>
              Reset line
            </button>
            <button
              type="button"
              className={chessStyles.btn}
              onClick={undo}
              disabled={history.length === 0}
            >
              Undo
            </button>
            <button type="button" className={chessStyles.btn} onClick={onExit}>
              Change variation
            </button>
          </div>
        </section>

        <aside className={chessStyles.panel}>
          <div className={chessStyles.card}>
            <h2 className={chessStyles.cardTitle}>Training line</h2>
            <p className={chessStyles.hint}>
              You play <strong>{userColor}</strong>. Opponent follows the book automatically.
            </p>
            <div className={chessStyles.progressBar}>
              <div className={chessStyles.progressFill} style={{ width: `${progress}%` }} />
            </div>
            <p className={chessStyles.hint}>
              Move {history.length} / {line.moves.length}
            </p>
            <div className={styles.fullLine}>{line.moves.join(" ")}</div>
          </div>

          <div className={chessStyles.card}>
            <h2 className={chessStyles.cardTitle}>Suggestions</h2>
            <p className={chessStyles.hint}>
              {showSuggestions
                ? "Book move shown on your turn."
                : "Hidden — moves are validated when you play."}
            </p>
            {showSuggestions && studySuggestion && !complete && (
              <div className={chessStyles.analysis}>
                <div className={chessStyles.bestMove} data-highlight={true}>
                  <span className={chessStyles.bestMoveLabel}>Book move</span>
                  <span className={chessStyles.bestMoveValue}>{studySuggestion.san}</span>
                </div>
                <div className={chessStyles.continuation}>
                  <span className={chessStyles.contLabel}>Full line from here</span>
                  <code>{studySuggestion.continuation}</code>
                </div>
              </div>
            )}
            {showSuggestions && !studySuggestion && !complete && !isUserTurn && (
              <p className={chessStyles.muted}>Waiting for opponent…</p>
            )}
            {complete && (
              <p className={chessStyles.muted}>
                Line finished. Reset to practice again or pick another variation.
              </p>
            )}
          </div>

          {history.length > 0 && (
            <div className={chessStyles.card}>
              <h2 className={chessStyles.cardTitle}>Moves played</h2>
              <ol className={chessStyles.moveList}>
                {history.map((san, i) => (
                  <li key={i}>
                    {i % 2 === 0 && (
                      <span className={chessStyles.moveNo}>{i / 2 + 1}.</span>
                    )}
                    {san}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
