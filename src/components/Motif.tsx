/* The app's one visual language: the gap meter (a 0–30 dB bar with the 15 dB line) and its tick ruler.
   All pieces are decorative duplicates of numbers shown in text, so they are aria-hidden. */

const GAP_MAX = 30;
const GAP_THRESHOLD = 15;

/** Tick ruler for the gap scale: a tick every 5 dB, long ticks at 0, 15 and 30. */
export function GapRuler() {
  return <span className="gap-ruler" aria-hidden="true">{[0, 5, 10, 15, 20, 25, 30].map(db => <i key={db} className={db % 15 === 0 ? 'major' : undefined}/>)}</span>;
}

/** Tiny gap meter for list rows. */
export function MiniGap({ gapDb, alert }: { gapDb: number | null; alert: boolean }) {
  if (gapDb === null) return null;
  const fill = Math.max(0, Math.min(1, gapDb / GAP_MAX));
  return <span className={`mini-gap${alert ? ' mini-gap--alert' : ''}`} aria-hidden="true"><span className="mini-gap-fill" style={{ width: `${fill * 100}%` }}/><span className="mini-gap-tick" style={{ left: `${GAP_THRESHOLD / GAP_MAX * 100}%` }}/></span>;
}

/** Two calm bars comparing a baseline with a relative change (e.g. 1.08 or 2). */
export function RatioBars({ ratio }: { ratio: number }) {
  return <span className="ratio-bars" aria-hidden="true"><span className="ratio-base" style={{ width: `${100 / ratio}%` }}/><span className="ratio-up"/></span>;
}
