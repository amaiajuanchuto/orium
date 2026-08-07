/** Interpolates a mood rating (1-10) to a color: red (low) -> yellow (mid) -> green (high). */
export function colorForMood(mood: number | null | undefined): string {
  if (mood == null) return "var(--empty)";

  const LOW = [176, 74, 52];
  const MID = [217, 164, 65];
  const HIGH = [126, 157, 77];

  const t = (mood - 1) / 9;
  const [from, to, localT] =
    t < 0.5 ? [LOW, MID, t * 2] : [MID, HIGH, (t - 0.5) * 2];

  const [r, g, b] = from.map((c, i) => Math.round(c + (to[i]! - c) * localT));
  return `rgb(${r}, ${g}, ${b})`;
}
