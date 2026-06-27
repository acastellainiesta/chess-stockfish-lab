import Link from "next/link";
import styles from "./home.module.css";

const MODES = [
  {
    href: "/study/openings",
    icon: "📖",
    title: "Opening study",
    description:
      "Guided training: pick a variation, the opponent auto-plays the book, optional hints or strict move checking.",
  },
  {
    href: "/play",
    icon: "♟",
    title: "Analysis lab",
    description:
      "Full board: play both sides, opening book + Stockfish, variation toasts, force turn / force move / remove piece, undo, auto-move.",
  },
] as const;

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Chess Study Lab</h1>
        <p className={styles.heroText}>
          Choose how you want to train: guided opening study, or the full analysis
          board with book lines, Stockfish, and position editing.
        </p>
      </div>

      <div className={styles.grid}>
        {MODES.map((mode) => (
          <article key={mode.href} className={styles.card}>
            <span className={styles.cardIcon} aria-hidden>
              {mode.icon}
            </span>
            <h2 className={styles.cardTitle}>{mode.title}</h2>
            <p className={styles.cardDesc}>{mode.description}</p>
            <Link href={mode.href} className={styles.cardLink}>
              Open
            </Link>
          </article>
        ))}
      </div>

      <p className={styles.footer}>
        Openings in the book: Caro-Kann, Ruy Lopez, Sicilian Defence.
      </p>
    </main>
  );
}
