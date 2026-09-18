export function formatTime(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// BGG's description text is XML-escaped and often contains a literal <br/> for line
// breaks alongside standard HTML entities (e.g. "&amp;rsquo;" for a right single quote).
// Converting <br/> to a real newline first (before entity-decoding) preserves it —
// otherwise setting it as textarea.innerHTML would just silently drop the tag. Using
// the browser's own entity decoder (rather than a hand-rolled regex table) handles
// every entity BGG might send, including numeric ones, correctly and safely — the
// result is only ever read back out as a plain string, never re-inserted as HTML.
export function decodeBggDescription(raw: string): string {
  const withBreaks = raw.replace(/<br\s*\/?>/gi, '\n');
  const el = document.createElement('textarea');
  el.innerHTML = withBreaks;
  return el.value.replace(/<[^>]+>/g, '').trim();
}
