/** Format a duration in seconds as compact "4h 30m" / "45m" / "1h" / "59s". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  if (m === 0) return `${total}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${m}m`;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

/** Clock-style "MM:SS" with hours when present (e.g. hub timer CTA). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Helpful "3h remaining this week" style remainder (never negative). */
export function formatRemaining(seconds: number): string {
  return formatDuration(Math.max(0, seconds));
}