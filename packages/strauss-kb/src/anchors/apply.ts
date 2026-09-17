import { normalizeRepoUrl } from "../anchor-resolver/index.js";
import {
  kbAnchorLocatorSchema,
  type KbAnchor,
  type KbAnchorLocator,
} from "../kb-record.schema.js";
import {
  KbAnchorBaselineError,
  KbAnchorDropsBaselineError,
  KbAnchorSetDuplicateError,
  locatorText,
} from "./errors.js";

/** One change the write made, as the result and the log entry report it. */
export type KbAnchorChange = {
  /** `move` keeps a baseline under a new address; `add` and `drop` are plain. */
  op: "move" | "add" | "drop";
  from?: KbAnchorLocator;
  to?: KbAnchorLocator;
};

/** What a resolver stamps, and a caller may only ever carry, never mint. */
const BASELINE_FIELDS = [
  "hash",
  "hash_kind",
  "lines",
  "resolved_at",
  "resolver",
] as const;

const LOCATOR_FIELDS = [
  "file",
  "symbol",
  "span",
  "side",
  "repo",
  "ref",
] as const;

export type KbAnchorSetOptions = {
  dropBaselines?: boolean;
};

export type KbAnchorSetOutcome = {
  anchors: KbAnchor[];
  changes: KbAnchorChange[];
};

/**
 * Checks a proposed anchor set against the record's current one, and says what
 * changed.
 *
 * The set is the caller's; the baselines are the record's. A hash may move to
 * another address — that is a reviewed rename — but it may not be invented,
 * altered or duplicated, and it may not be dropped by accident.
 *
 One rule, and a record's birth is not an exception to it: `current` is empty
 * there, so a first write can only ask for addresses. `anchor-resolve` is what
 * turns one into evidence, and it writes through the store rather than here.
 */
export function applyAnchorSet(
  conceptId: string,
  current: KbAnchor[],
  incoming: KbAnchor[],
  options: KbAnchorSetOptions = {},
): KbAnchorSetOutcome {
  const anchors = incoming.map((anchor) => ({ ...anchor }));

  const seen = new Set<string>();
  for (const anchor of anchors) {
    const key = locatorKey(anchor);
    if (seen.has(key)) {
      throw new KbAnchorSetDuplicateError(locatorText(locatorOf(anchor)));
    }
    seen.add(key);
  }

  // A baseline is identified by its hash: the record's own stamps are the only
  // ones a caller may hand back.
  const held = new Map(
    current
      .filter((anchor) => anchor.hash)
      .map((anchor) => [anchor.hash, anchor]),
  );
  const carried = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor.hash) continue;
    const source = held.get(anchor.hash);
    const where = locatorText(locatorOf(anchor));
    if (!source) throw new KbAnchorBaselineError(where, "unknown");
    if (!sameBaseline(anchor, source)) {
      throw new KbAnchorBaselineError(where, "altered");
    }
    if (carried.has(anchor.hash)) {
      throw new KbAnchorBaselineError(where, "reused");
    }
    carried.add(anchor.hash);
  }

  // Evidence never leaves silently. An unstamped anchor going is housekeeping.
  const abandoned = current.filter(
    (anchor) => anchor.hash !== undefined && !carried.has(anchor.hash),
  );
  if (abandoned.length && options.dropBaselines !== true) {
    throw new KbAnchorDropsBaselineError(
      conceptId,
      abandoned.map((anchor) => locatorText(locatorOf(anchor))),
    );
  }

  return { anchors, changes: diff(current, anchors) };
}

/**
 * What the write did, in the reader's terms: a baseline that changed address
 * moved, an anchor the set no longer holds was dropped, the rest were added.
 * Derived from before and after rather than declared by the caller, so the log
 * records what happened.
 */
function diff(current: KbAnchor[], next: KbAnchor[]): KbAnchorChange[] {
  const before = new Map(
    current.filter((anchor) => anchor.hash).map((a) => [a.hash as string, a]),
  );
  const beforeLocators = new Map(current.map((a) => [locatorKey(a), a]));
  const afterLocators = new Set(next.map((anchor) => locatorKey(anchor)));
  const moved = new Set<string>();
  const changes: KbAnchorChange[] = [];

  for (const anchor of next) {
    const source = anchor.hash ? before.get(anchor.hash) : undefined;
    if (source) {
      if (locatorKey(source) === locatorKey(anchor)) continue;
      moved.add(locatorKey(source));
      changes.push({
        op: "move",
        from: locatorOf(source),
        to: locatorOf(anchor),
      });
      continue;
    }
    if (beforeLocators.has(locatorKey(anchor))) continue;
    changes.push({ op: "add", to: locatorOf(anchor) });
  }

  for (const anchor of current) {
    const key = locatorKey(anchor);
    if (afterLocators.has(key) || moved.has(key)) continue;
    changes.push({ op: "drop", from: locatorOf(anchor) });
  }
  return changes;
}

function sameBaseline(left: KbAnchor, right: KbAnchor): boolean {
  return BASELINE_FIELDS.every((field) => left[field] === right[field]);
}

/** An anchor's address, without the baseline a resolver stamped onto it. */
export function locatorOf(anchor: KbAnchor): KbAnchorLocator {
  return kbAnchorLocatorSchema.parse(
    Object.fromEntries(
      LOCATOR_FIELDS.flatMap((field) =>
        anchor[field] === undefined ? [] : [[field, anchor[field]]],
      ),
    ),
  );
}

/**
 * One address as a comparable string. `repo` goes through the resolver's own
 * normalisation, so two spellings of one remote are one place; an absent
 * `side` reads as `new`, which is what it means.
 */
function locatorKey(anchor: KbAnchor): string {
  return JSON.stringify([
    anchor.file,
    anchor.symbol ?? "",
    anchor.span ? `${anchor.span.start}-${anchor.span.end}` : "",
    anchor.side ?? "new",
    anchor.repo === undefined ? "" : normalizeRepoUrl(anchor.repo),
    anchor.ref ?? "",
  ]);
}
