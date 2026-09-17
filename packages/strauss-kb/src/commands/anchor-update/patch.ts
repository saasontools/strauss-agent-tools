import { normalizeRepoUrl } from "../../anchor-resolver/index.js";
import {
  kbAnchorLocatorSchema,
  type KbAnchor,
  type KbAnchorLocator,
} from "../../kb-record.schema.js";
import {
  KbAnchorBoundaryError,
  KbAnchorPatchConflictError,
  KbAnchorPatchEmptiesRecordError,
  KbAnchorPatchEmptyError,
  KbAnchorSelectorError,
  locatorText,
} from "./errors.js";
import {
  anchorPatchInputSchema,
  type AnchorPatchInput,
  type KbAnchorChange,
  type KbAnchorPatchResult,
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
 * The fields a replacement may not cross, because the baseline would not
 * travel with it. See `decision.anchor-update-no-cross-boundary-replace`.
 */
const BOUNDARY_FIELDS = ["repo", "ref", "side"] as const;

/**
 * Applies a reviewed pointer patch to one record's anchors. Pure: nothing here
 * resolves, hashes or reads code, and a replaced anchor keeps its baseline.
 * Every selector matches against `current`, never the list earlier operations
 * left — `decision.anchor-update-selectors-match-original-list`.
 */
export function applyAnchorPatch(
  conceptId: string,
  current: KbAnchor[],
  input: AnchorPatchInput,
): KbAnchorPatchResult {
  // Parsed here rather than trusted, as `composeRecord` is: the CLI and the
  // MCP tool validate at their boundary, but a library caller forwarding its
  // own JSON has no such gate — and an unparsed `hash` under a locator is the
  // one thing this command exists to refuse.
  const patch = anchorPatchInputSchema.parse(input);
  const replace = patch.replace ?? [];
  const add = patch.add ?? [];
  const remove = patch.remove ?? [];
  if (!replace.length && !add.length && !remove.length) {
    throw new KbAnchorPatchEmptyError(conceptId);
  }

  // One operation per anchor, keyed by position so two spellings of one
  // anchor are still a conflict.
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

  // Locator fields only, so a new anchor cannot arrive with a baseline
  // nothing measured. `anchor-resolve` stamps one.
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
  if (!anchors.length) throw new KbAnchorPatchEmptiesRecordError(conceptId);

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
 * The original with the named locator fields overwritten, baseline untouched.
 * `symbol` and `span` are alternative addresses, so naming one clears the
 * other; everything the `to` omits is kept, which makes a rename one field.
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

  // Swapping a symbol for a span or back is a boundary too, once there is a
  // baseline: an `ast` hash is over a token stream and a span is hashed raw,
  // so the stored one describes the address being left behind.
  if (anchor.hash !== undefined) {
    if (wanted.span !== undefined && anchor.symbol !== undefined) {
      throw new KbAnchorBoundaryError("address", "symbol", "span");
    }
    if (wanted.symbol !== undefined && anchor.span !== undefined) {
      throw new KbAnchorBoundaryError("address", "span", "symbol");
    }
  }

  const next: KbAnchor = { ...anchor, ...wanted };
  if (wanted.symbol !== undefined) delete next.span;
  if (wanted.span !== undefined) delete next.symbol;
  return next;
}

/**
 * A record holds each pointer once: two anchors at one locator would drift and
 * rebaseline as a pair for ever. Destinations only — a duplicate a hand-edit
 * left behind is `kb_validate`'s finding, not this patch's failure.
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
 * One locator field as a comparable string, spelled out so a span's key order
 * cannot decide whether two anchors are the same place.
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
  // One remote has many spellings, and the resolver compares them normalised.
  // Raw here would let `…/name` and `…/name.git` be two anchors at one place.
  if (field === "repo") {
    return locator.repo === undefined ? "" : normalizeRepoUrl(locator.repo);
  }
  return locator[field] ?? "";
}

function locatorKey(anchor: KbAnchor): string {
  return JSON.stringify(LOCATOR_FIELDS.map((field) => fieldKey(anchor, field)));
}

/**
 * The object without its explicitly-undefined keys: a tool call may pass
 * `{ symbol: undefined }`, and spreading that would erase a field.
 */
function defined(locator: KbAnchorLocator): KbAnchorLocator {
  return Object.fromEntries(
    Object.entries(locator).filter(([, value]) => value !== undefined),
  ) as KbAnchorLocator;
}
