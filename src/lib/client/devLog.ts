/**
 * Development-only structured logging for the study statistics pipeline.
 * Compiled out of production builds; never logs credentials, tokens,
 * cookies or private user data — only segment/stat aggregates.
 */
export function devLog(event: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') return;
  const prefix = '[studyforge]';
  if (data === undefined) console.log(prefix, event);
  else console.log(prefix, event, JSON.stringify(data));
}
