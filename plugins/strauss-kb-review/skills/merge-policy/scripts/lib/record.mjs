// @ts-check
/**
 * The `decision.merge-<subject>` body, and the one write that lands it.
 *
 * A `decision` carries four fixed sections and `write-decision` takes only
 * `alternative` and `impact` (`packages/strauss-kb/src/decision-record.ts`),
 * so the evidence and the not-checked list ride inside `Impact` rather than
 * earning headings of their own. No anchor: the record is about the range.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  asString,
  childEnv,
  oneLine,
  parseFrontmatter,
} from "../../../../hooks/scripts/lib/util.mjs";

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
    tags: ["review", "review:merge-policy"],
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
 * `decision.merge-<subject>` is written once per subject, so a rerun writes a
 * numbered sibling that supersedes every current one rather than colliding on
 * the id — the store refuses a second write of a concept id, and a record
 * naming itself in `supersedes` is a no-op.
 * @param {string} bundle @param {string} slug
 */
export function priorRecords(bundle, slug) {
  // The ordinal is only ever the suffix this function added, so it is read
  // from the shape's own group — `merge-7` is subject 7, not ordinal 7.
  const shape = new RegExp(
    `^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-(\\d+))?$`,
  );
  /** @type {{ id: string, superseded: boolean, ordinal: number }[]} */
  const prior = [];
  let names;
  try {
    names = readdirSync(bundle);
  } catch {
    // No bundle is no prior record; the write below creates the directory.
    return prior;
  }
  for (const name of names) {
    if (!name.startsWith("decision.") || !name.endsWith(".md")) continue;
    const id = name.slice(0, -3);
    const found = shape.exec(id.slice("decision.".length));
    if (!found) continue;
    let status = "accepted";
    try {
      status =
        asString(
          parseFrontmatter(readFileSync(join(bundle, name), "utf8")).data
            .strauss_status,
        ) || "accepted";
    } catch {
      // Unreadable counts as present: the id is taken either way.
    }
    prior.push({
      id,
      superseded: status === "superseded",
      ordinal: Number(found[1] ?? 1),
    });
  }
  return prior;
}

/**
 * The slug this run writes under, and the current records it replaces.
 * @param {string} bundle @param {string} slug
 */
export function nextWrite(bundle, slug) {
  const prior = priorRecords(bundle, slug);
  const taken = new Set(prior.map((record) => record.ordinal));
  let ordinal = 1;
  while (taken.has(ordinal)) ordinal += 1;
  return {
    slug: ordinal === 1 ? slug : `${slug}-${ordinal}`,
    supersedes: prior
      .filter((record) => !record.superseded)
      .map((record) => record.id),
  };
}

/**
 * Writes the body through the CLI, as `agent:merge-policy`. Only an unattended
 * route under `--enforce` earns one: a dry run and a human route leave the
 * body in the JSON and touch nothing.
 * @param {{ kb: import("../../../../hooks/scripts/lib/cli.mjs").Launcher,
 *   body: ReturnType<typeof buildRecord>, route: string, enforcing: boolean }} how
 * @returns {{ written: boolean, why: string, conceptId: string | null,
 *   action?: string, supersededIds?: string[] }}
 */
export function writeRecord(how) {
  if (!how.enforcing) {
    return {
      written: false,
      why: "--write-record needs --enforce; this run only reported",
      conceptId: null,
    };
  }
  if (!UNATTENDED.includes(how.route)) {
    return {
      written: false,
      why: `route is ${how.route}, which a human signs off; nothing to record`,
      conceptId: null,
    };
  }

  const { slug, supersedes } = nextWrite(how.kb.bundle, how.body.slug);
  const input = {
    slug,
    title: how.body.title,
    why: how.body.why,
    alternative: how.body.alternative,
    impact: how.body.impact,
    tags: how.body.tags,
    ...(how.body.sources.length > 0 ? { sources: how.body.sources } : {}),
    ...(supersedes.length > 0 ? { supersedes } : {}),
  };

  const command = how.kb.command ?? "strauss-kb";
  const script = /\.[cm]?js$/.test(command);
  const argv = ["--bundle", how.kb.bundle, "write-decision"];
  const answer = spawnSync(
    script ? process.execPath : command,
    script ? [command, ...argv] : argv,
    {
      cwd: how.kb.cwd,
      encoding: "utf8",
      input: JSON.stringify(input),
      timeout: WRITE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...childEnv(), STRAUSS_KB_ACTOR: ACTOR },
      shell: false,
    },
  );
  if (answer.error || answer.status !== 0) {
    return {
      written: false,
      why: oneLine(
        answer.stderr || answer.error?.message || "the write verb failed",
        200,
      ),
      conceptId: null,
    };
  }
  /** @type {any} */
  let parsed = null;
  try {
    parsed = JSON.parse(answer.stdout ?? "");
  } catch {
    // The verb exited 0, so the record is there; only the receipt is missing.
  }
  return {
    written: true,
    why: `written as ${ACTOR}`,
    conceptId: asString(parsed?.conceptId) || `decision.${slug}`,
    action: asString(parsed?.action) || "created",
    supersededIds: Array.isArray(parsed?.supersededIds)
      ? parsed.supersededIds.map(String)
      : supersedes,
  };
}
