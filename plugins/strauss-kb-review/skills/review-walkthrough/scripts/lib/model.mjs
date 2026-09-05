// @ts-check
/**
 * The step model: the order a reviewer should read the diff in, derived from
 * the base. Nothing here is written by a model except the optional per-record
 * reviewer notes passed in through `--reviewer`.
 */
import { relative, resolve } from "node:path";
import { deepLink } from "./links.mjs";
import {
  citesSource,
  firstSentence,
  outboundLinks,
  section,
  splitConceptId,
  verifyCommand,
} from "./records.mjs";

/** Primary steps a reviewer will actually walk; the rest becomes `also`. */
export const STEP_CAP = 12;

/** Classifier classes a reviewer is told to skip. */
const SKIPPABLE = new Set(["generated", "boilerplate", "rename", "lockfile"]);

/** Tags whose facts stand in for the classifier, and always beat it. */
const SKIP_TAGS = [
  "review:generated",
  "review:boilerplate",
  "review:move",
  "review:extract",
];

const MATERIALITY_ORDER = { blocking: 0, important: 1 };

/** Standings that withdraw a record's claim on the reviewer's attention. */
const WITHDRAWN = new Set(["rejected", "superseded"]);

/**
 * @param {string|undefined} standing
 * @returns {boolean}
 */
function stands(standing) {
  return !WITHDRAWN.has(standing ?? "");
}

/** A refusal to render: exit 3, because the base does not fit this diff. */
export class Refusal extends Error {}

/** @typedef {{ conceptId: string, file?: string, symbol?: string, reason?: string }} AnchorFinding */

/** Anchors in the diff drifted, or nobody could check them. */
export class DriftRefusal extends Refusal {
  /**
   * @param {AnchorFinding[]} drift
   * @param {AnchorFinding[]} unchecked
   */
  constructor(drift, unchecked) {
    const names = (/** @type {AnchorFinding[]} */ entries) =>
      [...new Set(entries.map((entry) => entry.conceptId))].join(", ");
    super(
      [
        drift.length
          ? `anchors drifted since the base was stamped: ${names(drift)}.`
          : "",
        unchecked.length
          ? `anchors nobody could check: ${names(unchecked)}.`
          : "",
        "Rebaseline them (kb_anchor_resolve --rebaseline) or pass --allow-drift.",
      ]
        .filter(Boolean)
        .join(" "),
    );
    this.name = "DriftRefusal";
    this.drift = drift;
    this.unchecked = unchecked;
  }
}

/** `anchor-resolve` failed outright, so the deck has no drift answer at all. */
export class AnchorCheckError extends Refusal {
  /**
   * @param {string} conceptId
   * @param {{ message: string, stderr?: string }} cause
   */
  constructor(conceptId, cause) {
    super(`could not check ${conceptId}'s anchors: ${cause.message}`);
    this.name = "AnchorCheckError";
    this.stderr = (cause.stderr ?? "").trim().split("\n").slice(-5).join("\n");
  }
}

/**
 * @typedef {object} BuildOptions
 * @property {string} range `<base>..<head>`, passed to git and `match` verbatim.
 * @property {string} repoRoot
 * @property {string} bundle
 * @property {string|null} pr
 * @property {Record<string, { verdict?: string, note?: string, findings?: unknown[] }>} reviewer
 * @property {boolean} allowDrift
 */

/**
 * @param {unknown} value
 * @returns {any[]}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Where an anchor points, without the resolver's bookkeeping. `hash`,
 * `resolved_at` and `lines` change on every stamp and say nothing to a reader.
 *
 * @param {any} anchor
 * @returns {any}
 */
function anchorOf(anchor) {
  if (!anchor?.file) return null;
  return {
    file: anchor.file,
    ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
    ...(anchor.span ? { span: anchor.span } : {}),
    ...(anchor.side ? { side: anchor.side } : {}),
  };
}

/**
 * @param {unknown} anchors
 * @returns {any[]}
 */
function anchorsOf(anchors) {
  return asArray(anchors).map(anchorOf).filter(Boolean);
}

/**
 * The hunk a record was placed on, preferring a symbol-precision placement.
 *
 * @param {any[]} matches
 * @returns {Map<string, { filePath: string, hunk: any, precision: string, anchor: any, materiality?: string, confidence?: string, tags?: string[], title: string|null, standing: string, status: string }>}
 */
function placements(matches) {
  /** @type {Map<string, any>} */
  const best = new Map();
  for (const entry of matches) {
    for (const record of asArray(entry.records)) {
      const candidate = {
        filePath: entry.filePath,
        hunk: entry.hunk,
        precision: entry.precision,
        anchor: anchorOf(record.anchor),
        materiality: record.materiality,
        confidence: record.confidence,
        tags: record.tags ?? [],
        title: record.title ?? null,
        standing: record.standing,
        status: record.status,
      };
      const held = best.get(record.conceptId);
      if (
        !held ||
        (held.precision !== "symbol" && candidate.precision === "symbol")
      ) {
        best.set(record.conceptId, candidate);
      }
    }
  }
  return best;
}

/**
 * @param {any} placement
 * @param {string|null} pr
 */
function linkFor(placement, pr) {
  if (!placement) return deepLink({ pr, filePath: "", line: undefined });
  return deepLink({
    pr,
    filePath: placement.filePath,
    line: placement.hunk?.startLine,
    side: placement.hunk?.side,
  });
}

/**
 * @param {BuildOptions} options
 * @param {string} conceptId
 */
function verdictFor(options, conceptId) {
  const entry = options.reviewer[conceptId];
  if (!entry) return null;
  return {
    verdict: entry.verdict ?? null,
    note: entry.note ?? null,
    findings: asArray(entry.findings),
  };
}

/**
 * @param {import("./cli.mjs").Runners} runners
 * @param {BuildOptions} options
 * @returns {any}
 */
export function buildModel({ kb, git }, options) {
  const { range, repoRoot, bundle, pr } = options;
  const head = range.split(/\.{2,3}/).pop() || "HEAD";

  const loaded = /** @type {any} */ (
    kb(["load", "--all", "--repo-root", repoRoot])
  );
  /** @type {Map<string, any>} */
  const byId = new Map(
    asArray(loaded?.records).map((record) => [record.conceptId, record]),
  );

  const matches = asArray(
    kb([
      "match",
      "--git",
      range,
      "--repo-root",
      repoRoot,
      "--include-non-current",
    ]),
  );
  const placed = placements(matches);

  // Optional: SAA-728's verb. Absent, the base's own tags carry the skip list.
  const classified = /** @type {any} */ (
    kb(["classify", "--git", range, "--repo-root", repoRoot, "--json"], {
      optional: true,
    })
  );
  /** @type {Map<string, { class: string, reason?: string }>} */
  const classes = new Map(
    asArray(classified?.files).map((file) => [
      file.filePath,
      { class: file.class, reason: file.reason },
    ]),
  );

  const { drift, unchecked, resolved } = checkAnchors(kb, placed, repoRoot);
  if ((drift.length || unchecked.length) && !options.allowDrift) {
    throw new DriftRefusal(drift, unchecked);
  }

  const headSha = git([
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${head}^{commit}`,
  ]).trim();
  // `-z`: git quotes a path with a non-ASCII byte in it otherwise, and a
  // quoted path hashes to a deep link nobody can open.
  const changed = git([
    "diff",
    "--name-only",
    "-z",
    "--end-of-options",
    range,
    "--",
  ])
    .split("\0")
    .filter(Boolean);

  const bundleRel = relative(resolve(repoRoot), resolve(bundle));
  const inBundle = (/** @type {string} */ file) =>
    bundleRel !== "" &&
    !bundleRel.startsWith("..") &&
    (file === bundleRel || file.startsWith(`${bundleRel}/`));

  /** Content steps, which is what the cap counts. */
  /** @type {any[]} */
  const steps = [];
  /** @type {Set<string>} */
  const covered = new Set();

  const stamp = {
    kind: "stamp",
    title: `Reviewing ${range}`,
    why: "Everything below describes this commit; a different checkout reads a different diff.",
    detail: {
      range,
      headSha,
      digest: loaded?.digest ?? null,
      recordCount: loaded?.recordCount ?? 0,
      driftChecked: resolved,
      drift: [...new Set(drift.map((entry) => entry.conceptId))],
      unchecked: [...new Set(unchecked.map((entry) => entry.conceptId))],
    },
    link: { href: null, precise: false },
    collapsed: false,
  };

  for (const step of riskSteps(placed, byId, options)) {
    steps.push(step);
    if (step.detail.anchor?.file) covered.add(step.detail.anchor.file);
  }

  for (const step of acceptanceSteps(kb, byId, placed, options)) {
    steps.push(step);
    for (const entry of step.detail.satisfiedBy) {
      for (const anchor of entry.anchors) covered.add(anchor.file);
    }
  }

  const skip = skipStep(kb, byId, placed, classes, changed, inBundle, options);
  if (skip) {
    steps.push(skip);
    for (const file of skip.detail.files) covered.add(file.filePath);
    for (const entry of skip.detail.records) {
      for (const anchor of entry.anchors) covered.add(anchor.file);
    }
  }

  steps.push(...questionSteps(byId, placed, options));

  for (const file of changed) {
    if (covered.has(file) || inBundle(file)) continue;
    const klass = classes.get(file);
    steps.push({
      kind: "file",
      title: file,
      why: "Nothing in the base singles this out; read it as an ordinary hunk.",
      detail: {
        filePath: file,
        class: klass?.class ?? null,
        records: [...placed.entries()]
          .filter(([, placement]) => placement.filePath === file)
          .map(([conceptId]) => conceptId),
      },
      link: deepLink({ pr, filePath: file }),
      collapsed: true,
    });
  }

  // The stamp rides outside the cap: it says which commit the deck describes,
  // which every step below is worthless without.
  const primary = [stamp, ...steps.slice(0, STEP_CAP)].map((step, index) => ({
    n: index + 1,
    ...step,
  }));
  const also = steps.slice(STEP_CAP).map((step) => ({
    kind: step.kind,
    title: step.title,
    link: step.link,
  }));

  return {
    range,
    headSha,
    digest: loaded?.digest ?? null,
    pr: pr ?? null,
    classifier: classified ? "classify" : "kb-only",
    steps: primary.length - 1,
    primary,
    also,
    drift,
    unchecked,
  };
}

/**
 * What `anchor-resolve` says about every placed record. Drift and "nobody
 * could check" are different answers and both refuse the render; a resolve
 * that failed outright is neither, and stops it.
 *
 * @param {import("./cli.mjs").Runners["kb"]} kb
 * @param {Map<string, any>} placed
 * @param {string} repoRoot
 * @returns {{ drift: AnchorFinding[], unchecked: AnchorFinding[], resolved: number }}
 */
function checkAnchors(kb, placed, repoRoot) {
  /** @type {AnchorFinding[]} */
  const drift = [];
  /** @type {AnchorFinding[]} */
  const unchecked = [];
  let resolved = 0;
  for (const conceptId of [...placed.keys()].sort()) {
    /** @type {any} */
    let result;
    try {
      result = kb(["anchor-resolve", conceptId, "--repo-root", repoRoot], {
        optional: true,
      });
    } catch (error) {
      throw new AnchorCheckError(conceptId, /** @type {any} */ (error));
    }
    if (result === null) {
      // No such verb, so nothing was compared. Not the same as nothing moving.
      unchecked.push({
        conceptId,
        ...(placed.get(conceptId)?.anchor?.file
          ? { file: placed.get(conceptId).anchor.file }
          : {}),
        reason: "anchor-resolve unavailable",
      });
      continue;
    }
    resolved += 1;
    for (const entry of asArray(result.results)) {
      const finding = {
        conceptId,
        file: entry.file,
        ...(entry.symbol ? { symbol: entry.symbol } : {}),
        ...(entry.reason ? { reason: entry.reason } : {}),
      };
      if (entry.state === "drifted" && entry.rebaselined !== true) {
        drift.push(finding);
      } else if (entry.state === "unresolved") {
        unchecked.push(finding);
      }
    }
  }
  return { drift, unchecked, resolved };
}

/**
 * Blocking risks, then important ones. A risk with neither materiality is not
 * an attention claim, so it falls through to its file's step.
 *
 * @param {Map<string, any>} placed
 * @param {Map<string, any>} byId
 * @param {BuildOptions} options
 */
function riskSteps(placed, byId, options) {
  const risks = [...placed.entries()]
    .filter(
      ([conceptId, placement]) =>
        splitConceptId(conceptId).type === "risk" &&
        Object.hasOwn(MATERIALITY_ORDER, placement.materiality ?? "") &&
        // A resolved risk keeps its step — that the author closed a blocking
        // one is the reviewer's business. A rejected or superseded one does not.
        stands(placement.standing),
    )
    .sort(
      ([leftId, left], [rightId, right]) =>
        MATERIALITY_ORDER[/** @type {"blocking"} */ (left.materiality)] -
          MATERIALITY_ORDER[/** @type {"blocking"} */ (right.materiality)] ||
        leftId.localeCompare(rightId),
    );

  return risks.map(([conceptId, placement]) => {
    const record = byId.get(conceptId);
    const body = record?.body ?? "";
    const verifiedBy = outboundLinks(body)
      .filter((link) => link.rel === "verified_by")
      .map((link) => ({
        conceptId: link.target,
        standing: byId.get(link.target)?.standing ?? "unknown",
      }));
    return {
      kind: "risk",
      title: placement.title ?? record?.title ?? conceptId,
      why:
        placement.materiality === "blocking"
          ? "Blocking: do not merge without reading this."
          : "Important: read this before you approve.",
      detail: {
        conceptId,
        materiality: placement.materiality,
        confidence: placement.confidence ?? null,
        standing: placement.standing,
        status: placement.status,
        anchor: placement.anchor,
        mitigation: section(body, ["mitigation"]),
        verification: section(body, ["verification", "how to verify"]),
        verify: verifyCommand(record ?? { body }),
        verifiedBy,
        verifiedByState: verifiedByState(verifiedBy),
        verdict: verdictFor(options, conceptId),
      },
      link: linkFor(placement, options.pr),
      collapsed: false,
    };
  });
}

/**
 * @param {{ standing: string }[]} verifiedBy
 * @returns {"none"|"open"|"settled"}
 */
function verifiedByState(verifiedBy) {
  if (!verifiedBy.length) return "none";
  return verifiedBy.every((entry) => entry.standing === "current")
    ? "settled"
    : "open";
}

/**
 * Acceptance criteria in slug order, each with what claims to satisfy it. A
 * requirement counts when its slug starts `ac-` or it cites a source of its
 * own.
 *
 * @param {import("./cli.mjs").Runners["kb"]} kb
 * @param {Map<string, any>} byId
 * @param {Map<string, any>} placed
 * @param {BuildOptions} options
 */
function acceptanceSteps(kb, byId, placed, options) {
  const requirements = [...byId.values()]
    .filter((record) => {
      const { type, slug } = splitConceptId(record.conceptId);
      return (
        type === "requirement" &&
        stands(record.standing) &&
        (slug.startsWith("ac-") || citesSource(record))
      );
    })
    .sort((left, right) => left.conceptId.localeCompare(right.conceptId));

  return requirements.map((record) => {
    const backlinks = /** @type {any} */ (kb(["backlinks", record.conceptId]));
    const satisfiedBy = asArray(backlinks?.backlinks)
      .filter((link) => link.rel === "satisfies" && stands(link.standing))
      .map((link) => {
        const source = byId.get(link.from);
        const placement = placed.get(link.from);
        return {
          conceptId: link.from,
          title: link.title ?? source?.title ?? link.from,
          standing: link.standing,
          anchors: anchorsOf(source?.anchors),
          onDiff: Boolean(placement),
          link: placement
            ? linkFor(placement, options.pr)
            : deepLink({
                pr: options.pr,
                filePath: anchorsOf(source?.anchors)[0]?.file ?? "",
              }),
        };
      });
    return {
      kind: "acceptance",
      title: record.title ?? record.conceptId,
      why: "What was asked for, and the anchored symbols that claim to meet it.",
      detail: {
        conceptId: record.conceptId,
        claim: firstSentence(section(record.body ?? "", ["claim"])),
        satisfiedBy,
        verdict: verdictFor(options, record.conceptId),
      },
      link: linkFor(placed.get(record.conceptId), options.pr),
      collapsed: false,
    };
  });
}

/**
 * One step for everything the reviewer should not read line by line.
 *
 * @param {import("./cli.mjs").Runners["kb"]} kb
 * @param {Map<string, any>} byId
 * @param {Map<string, any>} placed
 * @param {Map<string, { class: string, reason?: string }>} classes
 * @param {string[]} changed
 * @param {(file: string) => boolean} inBundle
 * @param {BuildOptions} options
 */
function skipStep(kb, byId, placed, classes, changed, inBundle, options) {
  const files = changed
    .filter((file) => SKIPPABLE.has(classes.get(file)?.class ?? ""))
    .map((file) => ({
      filePath: file,
      class: /** @type {string} */ (classes.get(file)?.class),
      reason: classes.get(file)?.reason ?? null,
      link: deepLink({ pr: options.pr, filePath: file }),
    }));
  for (const file of changed) {
    if (!inBundle(file)) continue;
    files.push({
      filePath: file,
      class: "kb",
      reason: "the companion base itself — this walkthrough is its reading",
      link: deepLink({ pr: options.pr, filePath: file }),
    });
  }

  /** @type {Map<string, any>} */
  const records = new Map();
  for (const tag of SKIP_TAGS) {
    for (const entry of asArray(kb(["list", "fact", "--tag", tag]))) {
      if (records.has(entry.conceptId)) continue;
      // `list` selects; it carries no standing. Without the load's
      // adjudication a superseded fact still tells the reviewer to skip.
      const record = byId.get(entry.conceptId);
      if (!stands(record?.standing)) continue;
      const placement = placed.get(entry.conceptId);
      records.set(entry.conceptId, {
        conceptId: entry.conceptId,
        title: entry.title ?? entry.conceptId,
        tag,
        anchors: anchorsOf(entry.anchors),
        verify: verifyCommand({ ...entry, ...record }),
        onDiff: Boolean(placement),
        link: placement
          ? linkFor(placement, options.pr)
          : deepLink({
              pr: options.pr,
              filePath: asArray(entry.anchors)[0]?.file ?? "",
            }),
        verdict: verdictFor(options, entry.conceptId),
      });
    }
  }

  if (!files.length && !records.size) return null;
  return {
    kind: "skip",
    title: "Skip these",
    why: "Reading these by eye finds nothing their generator or their move did not intend.",
    detail: { files, records: [...records.values()] },
    link: { href: null, precise: false },
    collapsed: false,
  };
}

/**
 * Every unresolved question, with the assumption that holds until it is
 * answered. Ownership is not filtered: no read verb emits `owner`.
 *
 * @param {Map<string, any>} byId
 * @param {Map<string, any>} placed
 * @param {BuildOptions} options
 */
function questionSteps(byId, placed, options) {
  return [...byId.values()]
    .filter(
      (record) =>
        splitConceptId(record.conceptId).type === "open-question" &&
        // `resolved` adjudicates to `current`, so an answered question is not
        // one of these two standings and drops out here.
        (record.standing === "open" || record.standing === "unsettled"),
    )
    .sort((left, right) => left.conceptId.localeCompare(right.conceptId))
    .map((record) => ({
      kind: "question",
      title: record.title ?? record.conceptId,
      why: "The author could not settle this; you can.",
      detail: {
        conceptId: record.conceptId,
        question: section(record.body ?? "", ["question"]),
        assumption: section(record.body ?? "", [
          "default assumption",
          "assumption",
        ]),
        standing: record.standing,
        verdict: verdictFor(options, record.conceptId),
      },
      link: linkFor(placed.get(record.conceptId), options.pr),
      collapsed: false,
    }));
}
