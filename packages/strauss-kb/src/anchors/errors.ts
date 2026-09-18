import { BaseError, ErrorTypes, Fault } from "../errors.js";
import type { KbAnchorLocator } from "../kb-record.schema.js";

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
