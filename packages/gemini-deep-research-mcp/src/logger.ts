/**
 * Structured stderr logger.
 *
 * stdout is the JSON-RPC transport for a stdio MCP server: a single stray
 * console.log corrupts the stream and disconnects the client. This module is
 * the only place in the package allowed to write diagnostics (see the
 * package-level ESLint no-console override), and it writes exclusively to
 * stderr.
 */

const LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof LEVELS)[number];

function configuredLevel(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  const idx = LEVELS.indexOf(raw as LogLevel);
  return idx === -1 ? LEVELS.indexOf("info") : idx;
}

/**
 * Best-effort removal of API-key-shaped material from log output. Applied to
 * every logged value; also usable directly for error messages surfaced to
 * clients.
 */
export function redact(text: string): string {
  let out = text;
  // Google API keys ("AIza" + 35 url-safe chars, but be generous on length).
  out = out.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED]");
  // Anything assigned to a key/token/secret-ish name.
  out = out.replace(
    /((?:api[_-]?key|token|secret|authorization|x-goog-api-key)["':\s=]{1,5})[0-9A-Za-z_-]{8,}/gi,
    "$1[REDACTED]",
  );
  // The literal configured key value, wherever it appears.
  for (const env of ["GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
    const value = process.env[env];
    if (value && value.length >= 8) {
      out = out.split(value).join("[REDACTED]");
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, fields?: object): void {
  if (LEVELS.indexOf(level) > configuredLevel()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: redact(message),
    ...(fields ? JSON.parse(redact(JSON.stringify(fields))) : {}),
  });
  process.stderr.write(line + "\n");
}

export const log = {
  error: (message: string, fields?: object) => emit("error", message, fields),
  warn: (message: string, fields?: object) => emit("warn", message, fields),
  info: (message: string, fields?: object) => emit("info", message, fields),
  debug: (message: string, fields?: object) => emit("debug", message, fields),
};
