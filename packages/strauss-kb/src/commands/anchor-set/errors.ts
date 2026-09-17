import { BaseError, ErrorTypes, Fault } from "../../errors.js";
import type { KbAnchorLocator } from "../../kb-record.schema.js";

/**
 * A locator in the terms the caller wrote it, for an error message. Each field
 * is capped: `file` and `symbol` have no maximum length, and this text goes
 * into a tool result the caller pays for by the token.
 */
export function locatorText(locator: KbAnchorLocator): string {
  const span = locator.span ? `:${locator.span.start}-${locator.span.end}` : "";
  const symbol = locator.symbol ? `:${cap(locator.symbol)}` : "";
  const repo = locator.repo ? `${cap(locator.repo)}@` : "";
  const ref = locator.ref ? `@${cap(locator.ref)}` : "";
  return `${repo}${cap(locator.file)}${symbol}${span}${ref}`;
}

const FIELD_CAP = 120;

function cap(value: string): string {
  return value.length > FIELD_CAP ? `${value.slice(0, FIELD_CAP - 1)}…` : value;
}

/**
 * A baseline the record does not hold. The whole point of the command is that
 * a caller moves evidence it was given and never mints evidence of its own, so
 * every incoming hash has to be one the record already carries, with the rest
 * of its stamp intact, and used once.
 */
export class KbAnchorBaselineError extends BaseError {
  constructor(
    readonly locator: string,
    readonly reason: "unknown" | "altered" | "reused",
  ) {
    super({
      message: {
        unknown: `kb: ${locator} carries a hash this record does not hold — carry an existing anchor's baseline forward, or omit it and let anchor-resolve stamp one`,
        altered: `kb: ${locator} carries a known hash with a different hash_kind, lines, resolved_at or resolver — a baseline travels whole or not at all`,
        reused: `kb: ${locator} reuses a baseline another anchor in this set already carries — one measurement describes one place`,
      }[reason],
      errorType: ErrorTypes.KbAnchorBaseline,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { locator, reason, action: "refused" },
    });
  }
}

/**
 * A write that would discard evidence. Dropping an unstamped pointer is
 * housekeeping; dropping a stamped one throws away the record that someone
 * read this exact code, and the drift report goes quiet about it.
 */
export class KbAnchorDropsBaselineError extends BaseError {
  constructor(
    readonly conceptId: string,
    readonly dropped: string[],
  ) {
    super({
      message: `kb: this set drops ${dropped.length} stamped anchor(s) on ${conceptId} — ${dropped.join(", ")}. Carry the hash forward to keep the evidence, or pass dropBaselines to discard it on purpose`,
      errorType: ErrorTypes.KbAnchorDropsBaseline,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { conceptId, dropped, action: "refused" },
    });
  }
}

/** Two anchors at one address: they would drift and rebaseline as a pair. */
export class KbAnchorSetDuplicateError extends BaseError {
  constructor(readonly locator: string) {
    super({
      message: `kb: ${locator} appears twice in this set — a record holds each pointer once`,
      errorType: ErrorTypes.KbAnchorSetDuplicate,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { locator, action: "refused" },
    });
  }
}
