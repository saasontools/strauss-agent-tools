/** Longest title a one-line report quotes before cutting it. */
const ONE_LINE_MAX = 200;

/**
 * Another record's text, flattened to one bounded line for a prose report. A
 * title is data in a report whose headers state a count: a newline or an
 * escape in one would forge a row rather than fill one.
 */
export function oneLine(text: string, max = ONE_LINE_MAX): string {
  const flat = text
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
