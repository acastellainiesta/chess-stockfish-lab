import { NextRequest, NextResponse } from "next/server";

const STOCKFISH_ENDPOINT = "https://stockfish.online/api/s/v2.php";

/**
 * Server-side proxy for the StockfishOnline REST API.
 * Keeping the call on the server avoids browser CORS restrictions and lets us
 * normalise the slightly inconsistent field names the API returns
 * (`evaluation` in the example payload vs `eval` in the docs).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fen = searchParams.get("fen");
  const depthParam = searchParams.get("depth");

  if (!fen) {
    return NextResponse.json(
      { success: false, error: "Missing required `fen` query parameter." },
      { status: 400 }
    );
  }

  // The engine accepts a depth of up to 15 (int < 16).
  const depth = Math.max(1, Math.min(15, Number(depthParam) || 1));

  const upstream = new URL(STOCKFISH_ENDPOINT);
  upstream.searchParams.set("fen", fen);
  upstream.searchParams.set("depth", String(depth));

  try {
    const res = await fetch(upstream.toString(), {
      // Always hit the live engine, never a cached result.
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Stockfish API responded with ${res.status}.` },
        { status: 502 }
      );
    }

    const data = await res.json();

    // `bestmove` arrives as e.g. "bestmove b7b6 ponder f3e5".
    const rawBestMove: string | undefined = data?.bestmove;
    const parts = typeof rawBestMove === "string" ? rawBestMove.split(" ") : [];
    const bestMove = parts.length >= 2 ? parts[1] : null;
    const ponder = parts.length >= 4 ? parts[3] : null;

    return NextResponse.json({
      success: Boolean(data?.success),
      depth,
      bestMove,
      ponder,
      evaluation: data?.evaluation ?? data?.eval ?? null,
      mate: data?.mate ?? null,
      continuation: data?.continuation ?? null,
      raw: data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error contacting Stockfish.",
      },
      { status: 502 }
    );
  }
}
