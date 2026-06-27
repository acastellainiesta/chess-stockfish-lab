/**
 * Ensures Caro-Kann, Ruy Lopez, and Sicilian follow identical book rules.
 * Run: npm run validate:openings
 */
import { Chess } from "chess.js";
import { CARO_KANN } from "../lib/openings/caroKann.ts";
import { RUY_LOPEZ } from "../lib/openings/ruyLopez.ts";
import { SICILIAN } from "../lib/openings/sicilian.ts";
import {
  getOpeningBookSuggestion,
  hasBookContinuations,
  hasDeviatedFromOpening,
  isOpeningLineExhausted,
  findOpeningsWithActiveBook,
} from "../lib/openings/matcher.ts";

const ALL = [CARO_KANN, RUY_LOPEZ, SICILIAN];

function canApplySuggestion(suggestFor, sideToMove, fromBook) {
  if (fromBook) return true;
  return suggestFor === "both" || suggestFor === sideToMove;
}

function shouldQueryStockfish(suggestFor, sideToMove, inBook) {
  if (inBook) return false;
  return suggestFor === "both" || suggestFor === sideToMove;
}

function play(history) {
  const c = new Chess();
  for (const m of history) {
    const ok = c.move(m);
    if (!ok) throw new Error(`Illegal move ${m} in ${history.join(" ")}`);
  }
  return c;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Same structural checks for every opening in the registry. */
function validateOpeningParity(opening) {
  const c0 = play([]);
  const start = getOpeningBookSuggestion(opening, [], c0.fen());
  assert(start != null, `${opening.id}: empty board should have book suggestion`);
  assert(
    hasBookContinuations(opening, []),
    `${opening.id}: empty board should be in book`
  );
  assert(
    !hasDeviatedFromOpening(opening, []),
    `${opening.id}: empty board should not be deviated`
  );

  const entry = opening.lines[0]?.moves?.slice(0, 2) ?? [];
  if (entry.length >= 2) {
    const c = play(entry);
    assert(
      hasBookContinuations(opening, entry),
      `${opening.id}: entry position ${entry.join(" ")} should stay in book`
    );
    const book = getOpeningBookSuggestion(opening, entry, c.fen());
    assert(book != null, `${opening.id}: entry position should have next book move`);
  }

  const wrongFirst =
    opening.repertoireSide === "black" ? ["e4", "e5"] : ["e4", "c5"];
  if (wrongFirst.length >= 2) {
    assert(
      hasDeviatedFromOpening(opening, wrongFirst),
      `${opening.id}: ${wrongFirst.join(" ")} should deviate`
    );
    assert(
      !hasBookContinuations(opening, wrongFirst),
      `${opening.id}: deviated position should leave book`
    );
  }
}

function validateSuggestionFilters() {
  assert(canApplySuggestion("black", "white", true), "book white move when filter black");
  assert(canApplySuggestion("white", "black", true), "book black move when filter white");
  assert(!canApplySuggestion("white", "black", false), "stockfish black blocked for white filter");
  assert(shouldQueryStockfish("both", "white", false), "stockfish both sides out of book");
  assert(!shouldQueryStockfish("white", "black", false), "stockfish white filter blocks black");
  assert(!shouldQueryStockfish("both", "white", true), "no stockfish while in book");
}

function validateCrossOpeningSwitch() {
  const sicilianStart = ["e4", "c5"];
  const others = findOpeningsWithActiveBook(ALL, sicilianStart, "sicilian");
  assert(others.length === 0, "sicilian line should not suggest switching at own entry");

  const caroWrong = ["e4", "e5"];
  const switchFromCaro = findOpeningsWithActiveBook(ALL, caroWrong, "caro-kann");
  assert(
    switchFromCaro.some((o) => o.id === "ruy-lopez"),
    "e4 e5 should suggest Ruy Lopez when Caro-Kann selected"
  );
}

let failed = 0;
for (const opening of ALL) {
  try {
    validateOpeningParity(opening);
    console.log(`OK  ${opening.name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${opening.name}:`, e.message);
  }
}

try {
  validateSuggestionFilters();
  console.log("OK  suggestion filter parity");
} catch (e) {
  failed++;
  console.error("FAIL suggestion filters:", e.message);
}

try {
  validateCrossOpeningSwitch();
  console.log("OK  cross-opening switch hints");
} catch (e) {
  failed++;
  console.error("FAIL cross-opening:", e.message);
}

if (failed > 0) {
  process.exit(1);
}
console.log(`\nAll ${ALL.length} openings pass parity checks.`);
