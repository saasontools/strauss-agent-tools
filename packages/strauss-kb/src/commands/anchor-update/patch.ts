import {
  kbAnchorLocatorSchema,
  type KbAnchor,
  type KbAnchorLocator,
} from "../../kb-record.schema.js";
import {
  KbAnchorBoundaryError,
  KbAnchorPatchConflictError,
  KbAnchorPatchEmptyError,
  KbAnchorSelectorError,
  locatorText,
} from "./errors.js";
import type {
  AnchorPatchInput,
  KbAnchorChange,
  KbAnchorPatchResult,
} from "./model.js";

/** The locator fields, in the order a key spells them. */
const LOCATOR_FIELDS = [
  "file",
  "symbol",
  "span",
  "side",
  "repo",
  "ref",
] as const;

/**
 * The fields a replacement may not cross: each says which code the stored hash
 * was taken over, so carrying a baseline past one would claim a match nothing
 * checked. Remove and add instead.
 */
const BOUNDARY_FIELDS = ["repo", "ref", "side"] as const;

/**
 * Applies a reviewed pointer patch to one record's anchors.
 *
 * Pure, and every selector is resolved against `current` — the anchors as the
 * record holds them — rather than against the list as earlier operations left
 * it. Sequential matching would make `remove` before `replace` mean something
 * different from the same patch the other way round, and a caller reading a
 * refactor has no reason to think about the order the fields sit in.
 *
 * Nothing here resolves, hashes or reads code. A replaced anchor keeps its
 * `hash`, `hash_kind`, `lines`, `resolved_at` and `resolver`, so changed code
 * under a new name still reports drift until someone accepts it.
 */
export function applyAnchorPatch(
  conceptId: string,
  current: KbAnchor[],
  input: AnchorPatchInput,
): KbAnchorPatchResult {
  const replace = input.replace ?? [];
  const add = input.add ?? [];
  const remove = input.remove ?? [];
  if (!replace.length && !add.length && !remove.length) {
    throw new KbAnchorPatchEmptyError(conceptId);
  }

  // One operation per anchor. Keyed by position in `current`, so two selectors
  // spelled differently that land on one anchor are still a conflict.
  const claimed = new Set<number>();
  const claim = (selector: KbAnchorLocator): number => {
    const at = selectOne(current, selector);
    if (claimed.has(at)) {
      throw new KbAnchorPatchConflictError(
        locatorText(locatorOf(current[at] as KbAnchor)),
        "claimed-twice",
      );
    }
    claimed.add(at);
    return at;
  };

  const changes: KbAnchorChange[] = [];
  const replaced = new Map<number, KbAnchor>();
  for (const { from, to } of replace) {
    const at = claim(from);
    const anchor = current[at] as KbAnchor;
    const next = replacement(anchor, to);
    replaced.set(at, next);
    changes.push({
      op: "replace",
      from: locatorOf(anchor),
      to: locatorOf(next),
    });
  }

  const removed = new Set<number>();
  for (const selector of remove) {
    const at = claim(selector);
    removed.add(at);
    changes.push({ op: "remove", from: locatorOf(current[at] as KbAnchor) });
  }

  // Additions carry locator fields only — the schema rejects anything else —
  // so a new anchor cannot arrive with a baseline its code was never hashed
  // against. `anchor-resolve` is what stamps one.
  const added = add.map((locator) => defined(locator) as KbAnchor);
  for (const anchor of added)
    changes.push({ op: "add", to: locatorOf(anchor) });

  const anchors = [
    ...current.flatMap((anchor, at) =>
      removed.has(at) ? [] : [replaced.get(at) ?? anchor],
    ),
    ...added,
  ];
  assertDestinationsAreUnique(anchors, [...replaced.values(), ...added]);

  return { anchors, changes };
}

/**
 * The one anchor a selector names. A field the selector omits matches any
 * value, so `{ file }` alone addresses a file's only anchor and is ambiguous
 * the moment the file has two.
 */
function selectOne(current: KbAnchor[], selector: KbAnchorLocator): number {
  const matches = current.flatMap((anchor, at) =>
    matchesSelector(anchor, selector) ? [at] : [],
  );
  if (matches.length !== 1) {
    throw new KbAnchorSelectorError(selector, matches.length);
  }
  return matches[0] as number;
}

function matchesSelector(anchor: KbAnchor, selector: KbAnchorLocator): boolean {
  return LOCATOR_FIELDS.every((field) => {
    if (selector[field] === undefined) return true;
    return fieldKey(anchor, field) === fieldKey(selector, field);
  });
}

/**
 * The anchor a replacement produces: the original with the named locator
 * fields overwritten, baseline untouched.
 *
 * `symbol` and `span` are alternative addresses for one span, never both at
 * once, so naming one clears the other. Everything else the `to` omits is
 * kept, which is what makes a rename a one-field patch.
 */
function replacement(anchor: KbAnchor, to: KbAnchorLocator): KbAnchor {
  const wanted = defined(to);
  for (const field of BOUNDARY_FIELDS) {
    if (wanted[field] === undefined) continue;
    const before = fieldKey(anchor, field);
    const after = fieldKey(wanted, field);
    if (before === after) continue;
    throw new KbAnchorBoundaryError(field, before, after);
  }

  const next: KbAnchor = { ...anchor, ...wanted };
  if (wanted.symbol !== undefined) delete next.span;
  if (wanted.span !== undefined) delete next.symbol;
  return next;
}

/**
 * No pointer this patch writes may collide with another anchor on the record:
 * a record holds each pointer once, and two anchors at one locator would
 * drift, resolve and rebaseline as a pair for ever. Only destinations are
 * checked — a duplicate a hand-edit already left behind is `kb_validate`'s
 * finding, not this patch's failure.
 */
function assertDestinationsAreUnique(
  anchors: KbAnchor[],
  destinations: KbAnchor[],
): void {
  const counts = new Map<string, number>();
  for (const anchor of anchors) {
    const key = locatorKey(anchor);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const anchor of destinations) {
    if ((counts.get(locatorKey(anchor)) ?? 0) > 1) {
      throw new KbAnchorPatchConflictError(
        locatorText(locatorOf(anchor)),
        "duplicate-destination",
      );
    }
  }
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
 * One locator field as a comparable string. Spelled out rather than compared
 * with `JSON.stringify` on the whole value, so a span's key order cannot
 * decide whether two anchors are the same place — and an absent `side` reads
 * as `new`, which is what it means.
 */
function fieldKey(
  locator: KbAnchor | KbAnchorLocator,
  field: (typeof LOCATOR_FIELDS)[number],
): string {
  if (field === "span") {
    const span = locator.span;
    return span ? `${span.start}-${span.end}` : "";
  }
  if (field === "side") return locator.side ?? "new";
  return locator[field] ?? "";
}

function locatorKey(anchor: KbAnchor): string {
  return JSON.stringify(LOCATOR_FIELDS.map((field) => fieldKey(anchor, field)));
}

/**
 * The object without its explicitly-undefined keys. A tool call may pass
 * `{ symbol: undefined }` where JSON cannot, and spreading that would erase
 * the field the caller never meant to name.
 */
function defined(locator: KbAnchorLocator): KbAnchorLocator {
  return Object.fromEntries(
    Object.entries(locator).filter(([, value]) => value !== undefined),
  ) as KbAnchorLocator;
}
