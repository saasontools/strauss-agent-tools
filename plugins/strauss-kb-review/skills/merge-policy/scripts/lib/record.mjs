// @ts-check
/**
 * The `decision.merge-<subject>` body, and the one write that lands it.
 *
 * A `decision` carries four fixed sections and `write-decision` takes only
 * `alternative` and `impact` (`packages/strauss-kb/src/decision-record.ts`),
 * so the evidence and the not-checked list ride inside `Impact` rather than
 * earning headings of their own. No anchor: the record is about the range.
 */
import { run } from "../../../../hooks/scripts/lib/cli.mjs";
import { asString, oneLine } from "../../../../hooks/scripts/lib/util.mjs";

/** Who this record is written as. Never a human: the route is not a read. */
export const ACTOR = "agent:merge-policy";

/** The routes that merge without a human, and so owe a trail. */
const UNATTENDED = ["auto", "agent-review-then-auto"];

/** One write, so its budget is a kb verb's rather than the gate's. */
const WRITE_TIMEOUT_MS = 30_000;

/** How many rows of a list the body carries before it says "and N more". */
const CAP = 20;

/** A concept id is `type.slug`, and a slug is lower kebab. @param {string} subject */
export function slugify(subject) {
  const slug = String(subject)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unnamed";
}

/** The tag that says which subject a record belongs to. @param {string} slug */
export function subjectTag(slug) {
  return `review:merge-policy:${slug}`;
}

/**
 * The record body, built from the policy output alone.
 * @param {import("./inputs.mjs").Input} input
 * @param {{ route: string, rule: string, reason: string }} decision
 * @param {{ exit: 0 | 1, why: string, approvedBy: string[] }} verdict
 * @param {{ subject: string, pr: string | null, prUrl: string | null,
 *   notChecked: string[], enforcing: boolean,
 *   gate: { blocks: string[], warns: string[] } }} options
 */
export function buildRecord(input, decision, verdict, options) {
  const slug = `merge-${slugify(options.subject)}`;
  const label = options.pr ? `PR ${options.pr}` : options.subject;
  return {
    conceptId: `decision.${slug}`,
    slug,
    type: "decision",
    title: `Merge route for ${label}: ${decision.route}`,
    why: oneLine(`${decision.rule}: ${decision.reason}`, 240),
    alternative: alternative(decision),
    impact: impact(input, decision, verdict, options),
    // The subject tag is how a rerun finds its own priors: an id's shape says
    // nothing — `merge-7-2` is subject `7-2`, not the second write for `7`.
    tags: ["review", "review:merge-policy", subjectTag(slug)],
    sources: options.prUrl
      ? [{ id: "pr", resource: options.prUrl, title: "Pull request" }]
      : [],
    anchors: [],
  };
}

/** What this route turned down. @param {{ route: string, rule: string, reason: string }} decision */
function alternative(decision) {
  if (decision.route === "human") {
    return `auto, and agent-review-then-auto. Rejected: \`${decision.rule}\` matched above both of them — ${oneLine(decision.reason, 200)}.`;
  }
  return `Human review. Rejected: \`${decision.rule}\` is a function of the base, so a human read here would add no fact the route did not already have.`;
}

/**
 * What merges without a human, then what was read to say so, then what was
 * not read at all.
 * @param {import("./inputs.mjs").Input} input
 * @param {{ route: string, rule: string, reason: string }} decision
 * @param {{ exit: 0 | 1, why: string, approvedBy: string[] }} verdict
 * @param {{ notChecked: string[], enforcing: boolean,
 *   gate: { blocks: string[], warns: string[] } }} options
 */
function impact(input, decision, verdict, options) {
  const files = input.files.length;
  const head =
    `Head ${input.headSha}, policy ${input.policy.path ?? "absent"} ${input.policy.hash ?? ""}`.trim();
  const opening = UNATTENDED.includes(decision.route)
    ? `\`${decision.route}\` merges ${files} changed file${files === 1 ? "" : "s"} with no human read. ${head}.`
    : `\`${decision.route}\` — nothing here merges without a human read. ${head}.`;

  const onDiff = input.records.filter((record) => record.onDiff);
  const considered = [
    `- records: ${
      list(
        onDiff.map(
          (record) =>
            `${record.id} (${record.type}, ${record.effective}, ${record.status}, verified by ${record.verifiedBy.join(" ") || "nobody"})`,
        ),
      ) || "none on the diff"
    }`,
    `- classifier: ${list(input.files.map((file) => `${file.path}=${file.class}`)) || "no changed files"}`,
    `- gate: blocks ${list(options.gate.blocks) || "none"}; warns ${list(options.gate.warns) || "none"}`,
    `- reviewer: ${
      input.reviewer.present
        ? `ran on ${input.reviewer.sha ?? "an unnamed commit"}, verdicts ${
            list(
              Object.entries(input.reviewer.verdicts).map(
                ([id, verdict_]) => `${id}=${verdict_}`,
              ),
            ) || "none"
          }`
        : "not supplied"
    }`,
    `- decider: ${options.enforcing ? `exit ${verdict.exit} — ${verdict.why}` : "not enforcing, so no exit code was claimed"}`,
  ];

  return [
    opening,
    "",
    "**Considered**",
    ...considered,
    "",
    "**Not checked**",
    ...(options.notChecked.length > 0
      ? options.notChecked.slice(0, CAP).map((note) => `- ${note}`)
      : ["- nothing: every dimension the policy names was read"]),
  ].join("\n");
}

/** @param {string[]} items */
function list(items) {
  if (items.length <= CAP) return items.join(", ");
  return `${items.slice(0, CAP).join(", ")}, and ${items.length - CAP} more`;
}

/**
 * @typedef {import("../../../../hooks/scripts/lib/cli.mjs").Launcher} Launcher
 * @typedef {(kb: Launcher, tag: string) => any[] | null} List
 * @typedef {(kb: Launcher, input: unknown) =>
 *   import("../../../../hooks/scripts/lib/cli.mjs").Run} Send
 * @typedef {{ list?: List, send?: Send }} Hooks
 */

/** Every record this subject already has, oldest ordinal first. Selection is
 * by tag, never by id shape: `merge-7-2` is subject `7-2`'s own record.
 * @param {Launcher} kb @param {string} slug @param {List} [list]
 * @returns {{ id: string, superseded: boolean, ordinal: number }[] | null}
 */
export function priorRecords(kb, slug, list = listBySubject) {
  const rows = list(kb, subjectTag(slug));
  if (!rows) return null;
  return rows
    .map((row) => ({
      id: asString(row?.conceptId),
      superseded: asString(row?.status) === "superseded",
      ordinal: ordinalOf(asString(row?.conceptId), slug),
    }))
    .filter((record) => record.id !== "")
    .sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
}

/** The suffix this module adds, or 0 for an id it did not write.
 * @param {string} id @param {string} slug */
function ordinalOf(id, slug) {
  const own = id.startsWith("decision.") ? id.slice("decision.".length) : "";
  if (own === slug) return 1;
  const rest = own.startsWith(`${slug}-`) ? own.slice(slug.length + 1) : "";
  return /^[1-9][0-9]*$/.test(rest) ? Number(rest) : 0;
}

/** @type {List} */
function listBySubject(kb, tag) {
  const answer = run(kb, ["list", "decision", "--tag", tag]);
  if (answer.missing || answer.unknownVerb || answer.status !== 0) return null;
  try {
    const rows = JSON.parse(answer.stdout);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/**
 * The slug this run writes under, and the one record it replaces: the record
 * for this subject that is still current. A rerun takes the next free ordinal
 * rather than colliding — the store refuses a second write of a concept id.
 * `skip` holds ordinals a failed attempt already found taken.
 * @param {Launcher} kb @param {string} slug @param {List} [list]
 * @param {Set<number>} [skip]
 */
export function nextWrite(kb, slug, list, skip = new Set()) {
  const prior = priorRecords(kb, slug, list);
  if (!prior) return null;
  const taken = new Set(prior.map((record) => record.ordinal));
  let ordinal = 1;
  while (taken.has(ordinal) || skip.has(ordinal)) ordinal += 1;
  const current = prior.filter((record) => !record.superseded);
  const last = current[current.length - 1];
  return {
    ordinal,
    slug: ordinal === 1 ? slug : `${slug}-${ordinal}`,
    supersedes: last ? [last.id] : [],
  };
}

/** @type {Send} */
function sendWrite(kb, input) {
  return run(kb, ["write-decision"], {
    input: JSON.stringify(input),
    env: { STRAUSS_KB_ACTOR: ACTOR },
    timeout: WRITE_TIMEOUT_MS,
  });
}

/**
 * Writes the body through the CLI, as `agent:merge-policy`. Only an unattended
 * route under `--enforce` earns one: a dry run, a `dry-run` policy and a human
 * route leave the body in the JSON and touch nothing.
 * @param {{ kb: Launcher, body: ReturnType<typeof buildRecord>, route: string,
 *   enforcing: boolean, enabled?: string }} how
 * @param {Hooks} [hooks]
 * @returns {{ written: boolean, why: string, conceptId: string | null,
 *   action?: string, supersededIds?: string[] }}
 */
export function writeRecord(how, hooks = {}) {
  if (!how.enforcing) {
    return {
      written: false,
      why: "--write-record needs --enforce; this run only reported",
      conceptId: null,
    };
  }
  if (!UNATTENDED.includes(how.route) || how.enabled === "dry-run") {
    return {
      written: false,
      why:
        how.enabled === "dry-run"
          ? "policy is enabled: dry-run, so the route is reported and nothing lands"
          : `route is ${how.route}, which a human signs off; nothing to record`,
      conceptId: null,
    };
  }

  // One retry, because the scan and the write are not one step: a sibling run
  // may take the ordinal in between, and the store refuses the collision.
  let attempt = land(how, hooks, new Set());
  if (attempt.collided) attempt = land(how, hooks, new Set([attempt.ordinal]));
  return attempt.answer;
}

/** One scan-then-write pass. @param {Parameters<typeof writeRecord>[0]} how
 * @param {Hooks} hooks @param {Set<number>} skip */
function land(how, hooks, skip) {
  const next = nextWrite(how.kb, how.body.slug, hooks.list, skip);
  if (!next) {
    return {
      collided: false,
      ordinal: 0,
      answer: {
        written: false,
        why: "could not list the prior records for this subject",
        conceptId: null,
      },
    };
  }
  const { slug, supersedes } = next;
  const answer = (hooks.send ?? sendWrite)(how.kb, {
    slug,
    title: how.body.title,
    why: how.body.why,
    alternative: how.body.alternative,
    impact: how.body.impact,
    tags: how.body.tags,
    ...(how.body.sources.length > 0 ? { sources: how.body.sources } : {}),
    ...(supersedes.length > 0 ? { supersedes } : {}),
  });

  if (answer.missing || answer.status !== 0) {
    return {
      collided: /already exists/i.test(answer.stderr),
      ordinal: next.ordinal,
      answer: {
        written: false,
        why: oneLine(
          answer.stderr ||
            (answer.missing
              ? "the kb CLI could not be spawned"
              : "the write verb failed"),
          200,
        ),
        conceptId: null,
      },
    };
  }
  /** @type {any} */
  let parsed = null;
  try {
    parsed = JSON.parse(answer.stdout);
  } catch {
    // The verb exited 0, so the record is there; only the receipt is missing.
  }
  return {
    collided: false,
    ordinal: next.ordinal,
    answer: {
      written: true,
      why: `written as ${ACTOR}`,
      conceptId: asString(parsed?.conceptId) || `decision.${slug}`,
      action: asString(parsed?.action) || "created",
      supersededIds: Array.isArray(parsed?.supersededIds)
        ? parsed.supersededIds.map(String)
        : supersedes,
    },
  };
}
