import { createHash } from "node:crypto";

/** sha256 of `text`, hex — the fingerprint a caller keys a diff by. */
export function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
