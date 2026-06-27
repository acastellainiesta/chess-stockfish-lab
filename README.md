# Chess Stockfish Lab

A web-based chess analysis board that lets you play both sides of a position and asks the **Stockfish** engine for the best move after every turn — without installing anything or running an engine on your computer. Open the site, set up a position, and the engine's recommended move is drawn straight onto the board.

> [!CAUTION]
> This is a **learning and analysis tool**, not a cheating tool. Using engine help during rated games on chess com, Lichess, or in tournaments violates their rules and will very likely get you banned. Struggling at chess doesn't make you any less smart. Please use this fairly and be kind to other players.

https://github.com/user-attachments/assets/4c239938-d3a8-414e-9bca-72e9bee336bd

## What is Stockfish?

[Stockfish](https://stockfishchess.org/) is the strongest open-source chess engine in the world. Give it a position and it searches millions of variations to tell you the best move and how good the position is. It's the same engine that powers the analysis on most major chess sites.

The catch is that running Stockfish properly is **heavy**: it eats CPU and memory, it has to be installed and configured, and weaker machines struggle to run it at a useful strength. Not everyone can or wants to set that up.

## What this solves

Instead of bundling a local engine, this app talks to the free [StockfishOnline REST API](https://stockfish.online/docs.php). The analysis runs **remotely**, so:

- **Nothing to install** — it's just a website. No engine binaries, no setup.
- **Runs anywhere** — any modern browser, even on low-powered devices, because your machine isn't doing the heavy calculation.
- **Always available** — you get real Stockfish strength without paying the performance cost locally.

You bring the position; the cloud brings the engine.

## Features

- **Play both colours** on a single board — perfect for walking through lines by hand.
- **Engine suggestions** drawn as an arrow after every move (green when it's your chosen colour's turn, grey otherwise), with evaluation, mate detection, the ponder move, and the top line.
- **Pick the game phase** (opening / mid-game / end-game), which controls how deep the engine searches.
- **Choose which colour to optimise for**, so the engine highlights the winning move for your side.
- **Confirm buttons** to auto-play Stockfish's suggestion for White or Black — or ignore it and play your own move.
- **Toggle suggestions on/off** when you just want to move pieces in peace.
- **Free board editing**: right-click a piece to *force-move* it anywhere (ignoring turn and legality) or *remove* it, and force which colour is to move.
- **Drag-and-drop or click-to-move**, with legal moves highlighted.
- **Undo / Redo, flip board, new game.**

## Adjusting the search depth

"Depth" is how many moves ahead the engine looks — deeper means stronger but slower. Depth is tied to the game phase, and a fresh value is picked at random on every call:

| Phase     | Depth     |
| --------- | --------- |
| Opening   | 5         |
| Mid-game  | 6 or 7    |
| End-game  | 8 – 13    |

The StockfishOnline API accepts depths from **5 to 15**. You can change these ranges freely in `PHASE_DEPTHS` inside `app/page.tsx` — raise them for stronger (slower) analysis or lower them for faster responses.

## How it works

The engine is never called directly from the page. Requests go through a small server-side proxy at `app/api/stockfish/route.ts`, which forwards the position (FEN) and depth to StockfishOnline and tidies up the response.

A useful side effect of this design: the tool is a **self-contained website**. It doesn't inject any scripts into chess sites, and the engine requests are made by this app's own server — not from code running on a game page — so a chess website can't inspect or block them.

> [!WARNING]
> That isolation is **not** an invitation to use this for advantage play. Anti-cheat systems also rely on move-quality statistics and behaviour, not just network traffic, and you will most likely be caught and banned. Keep it to analysis, study, and post-game review.

## Staying up to date

> [!NOTE]
> Stockfish and the StockfishOnline API keep evolving — endpoints, accepted depth ranges, and response fields can change over time (the minimum depth, for example, has already shifted in the past). If something breaks because of an upstream change, it's not necessarily a bug on your end. This repo is maintained and will be updated to keep up with those changes.

## Running it locally

You'll need Node 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To build for production:

```bash
npm run build
npm start
```

## Good to know

- It relies on a free public API, so analysis can occasionally fail if you spam the API. When that happens you'll see the error HTTP 429 (Too Many Requests) in the analysis panel — just make another move to retry or press undo/redo.
- Forced edits (force-move, remove piece, force turn) intentionally skip the rules. Because they aren't real moves, they don't appear in the move list, and **Undo won't revert them** — Undo only steps back through legal moves.
- Promotions auto-queen.

## Built with

| Library | Role | License |
|--------|------|---------|
| [Next.js](https://nextjs.org/) | App framework (App Router) + API proxy | MIT |
| [chess.js](https://github.com/jhlywa/chess.js) | Move generation, rules, FEN/PGN | BSD-2-Clause |
| [react-chessboard](https://github.com/Clariity/react-chessboard) | Chessboard UI | MIT |
| [StockfishOnline API](https://stockfish.online/docs.php) | Remote Stockfish analysis | — |
| [TypeScript](https://www.typescriptlang.org/) | Language | Apache-2.0 |
