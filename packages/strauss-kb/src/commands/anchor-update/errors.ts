import { BaseError, ErrorTypes, Fault } from "../../errors.js";
import type { KbAnchorLocator } from "../../kb-record.schema.js";

/** A locator in the terms the caller wrote it, for an error message. */
export function locatorText(locator: KbAnchorLocator): string {
  const span = locator.span ? `:${locator.span.start}-${locator.span.end}` : "";
  const symbol = locator.symbol ? `:${locator.symbol}` : "";
  const repo = locator.repo ? `${locator.repo}@` : "";
  const ref = locator.ref ? `@${locator.ref}` : "";
  return `${repo}${locator.file}${symbol}${span}${ref}`;
}

/**
 * A selector that named no anchor, or more than one. Picking the first of two
 * would move a pointer the caller never read.
 */
export class KbAnchorSelectorError extends BaseError {
  constructor(
    readonly selector: KbAnchorLocator,
    readonly matched: number,
  ) {
    super({
      message:
        matched === 0
          ? `kb: no anchor matches ${locatorText(selector)} — name one that exists`
          : `kb: ${locatorText(selector)} matches ${matched} anchors — add a symbol, span, repo or ref until it names one`,
      errorType: ErrorTypes.KbAnchorSelector,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { selector: locatorText(selector), matched, action: "refused" },
    });
  }
}

/** A patch with nothing in it: no replacement, no addition, no removal. */
export class KbAnchorPatchEmptyError extends BaseError {
  constructor(readonly conceptId: string) {
    super({
      message: `kb: the patch for ${conceptId} changes nothing — pass at least one replace, add or remove`,
      errorType: ErrorTypes.KbAnchorPatchEmpty,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { conceptId, action: "refused" },
    });
  }
}

/**
 * Two selectors claiming one anchor, or two pointers landing on one locator.
 * Refused for the whole patch, never resolved in favour of one.
 */
export class KbAnchorPatchConflictError extends BaseError {
  constructor(
    readonly locator: string,
    readonly reason: "claimed-twice" | "duplicate-destination",
  ) {
    super({
      message:
        reason === "claimed-twice"
          ? `kb: two operations claim the anchor ${locator} — one operation per anchor`
          : `kb: ${locator} would appear twice — a record holds each pointer once`,
      errorType: ErrorTypes.KbAnchorPatchConflict,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { locator, reason, action: "refused" },
    });
  }
}

/**
 * A replacement that would move an anchor to another repository, rev or side,
 * carrying a baseline measured somewhere else. Remove and add instead.
 */
export class KbAnchorBoundaryError extends BaseError {
  constructor(
    readonly field: "repo" | "ref" | "side",
    readonly from: string,
    readonly to: string,
  ) {
    super({
      message: `kb: a replacement cannot change ${field} (${from} → ${to}) — the baseline would not travel with it; remove the anchor and add the new one`,
      errorType: ErrorTypes.KbAnchorBoundary,
      code: 400,
      fault: Fault.User,
      retriable: false,
      reportToUser: true,
      details: { field, from, to, action: "refused" },
    });
  }
}
