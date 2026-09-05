// @ts-check
/**
 * The record, rendered as one markdown block a CI step upserts onto the PR.
 * The marker is the first line so `gh api` can find the comment it owns; the
 * block is capped so a sticky comment stays a summary and not a second diff.
 */
import { oneLine } from "../../../../hooks/scripts/lib/util.mjs";

/** What a CI step matches on to find its own comment. Never change it. */
export const MARKER = "<!-- strauss-kb merge-policy -->";

/** A sticky comment a person scrolls past is not read. */
export const MAX_LINES = 40;

/** Rows each capped list carries before the block says how many it dropped. */
const RECORDS = 8;
const CLASSES = 8;
const NOT_CHECKED = 5;

/**
 * `https://github.com/<owner>/<repo>/pull/<n>` and nothing else, so a record
 * link can only ever be built on a host this step named itself.
 * @param {string | null | undefined} url
 * @returns {{ repo: string, number: string } | null}
 */
export function prRepo(url) {
  if (!url) return null;
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.host !== "github.com") return null;
  const parts = parsed.pathname.replace(/\/+$/, "").split("/");
  if (parts.length !== 5 || parts[3] !== "pull") return null;
  if (!/^[1-9][0-9]*$/.test(parts[4] ?? "")) return null;
  return {
    repo: `https://github.com/${parts[1]}/${parts[2]}`,
    number: parts[4] ?? "",
  };
}

/**
 * One markdown block, at most `MAX_LINES` lines.
 * @param {any} model the `--json` shape
 * @returns {string}
 */
export function report(model) {
  const link = prRepo(model.prUrl);
  const lines = [
    MARKER,
    `### Merge policy: ${model.route}`,
    "",
    "| | |",
    "| --- | --- |",
    `| route | \`${model.route}\` via \`${model.rule}\` |`,
    `| why | ${cell(model.reason)} |`,
    `| policy | ${policy(model)} |`,
    `| head | \`${cell(model.headSha)}\` |`,
    ...(model.enforce
      ? [
          `| enforce | exit ${model.enforce.exit} — ${cell(model.enforce.why)} |`,
        ]
      : []),
    ...(model.wrote
      ? [
          `| record | ${model.wrote.written ? `\`${cell(model.wrote.conceptId)}\`` : `not written — ${cell(model.wrote.why)}`} |`,
        ]
      : []),
    "",
    ...records(model, link),
    "",
    ...facts(model),
    ...notChecked(model),
  ];
  return `${trim(lines).join("\n")}\n`;
}

/** Which file decided this, at which version and digest. @param {any} model */
function policy(model) {
  return [
    `\`${cell(model.policy.path ?? "absent")}\``,
    ...(model.policy.version === null
      ? []
      : [`v${cell(model.policy.version)}`]),
    `\`${cell(model.policy.hash ?? "no hash")}\``,
    ...(model.policy.enabled === "true"
      ? []
      : [`(${cell(model.policy.enabled)})`]),
  ].join(" ");
}

/** @param {any} model @param {ReturnType<typeof prRepo>} link */
function records(model, link) {
  /** @type {any[]} */
  const rows = model.records;
  if (rows.length === 0) return ["**Records on the diff** — none."];
  const head = [
    `**Records on the diff** — ${rows.length}`,
    "",
    "| record | type | materiality | status | verified by |",
    "| --- | --- | --- | --- | --- |",
  ];
  const body = rows.slice(0, RECORDS).map((row) => {
    const name = link
      ? `[${cell(row.id)}](${link.repo}/blob/${encodeURIComponent(model.headSha)}/${model.bundle}/${encodeURIComponent(row.id)}.md)`
      : `\`${cell(row.id)}\``;
    return `| ${name} | ${cell(row.type)} | ${cell(row.effective)} | ${cell(row.status)} | ${cell(row.verifiedBy.join(", ") || "nobody")} |`;
  });
  const rest =
    rows.length > RECORDS ? ["", `and ${rows.length - RECORDS} more.`] : [];
  return [...head, ...body, ...rest];
}

/** Classifier, gate and reviewer, one line each. @param {any} model */
function facts(model) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const name of Object.values(model.classifier)) {
    counts[String(name)] = (counts[String(name)] ?? 0) + 1;
  }
  const classes = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${name} ${count}`);
  const verdicts = Object.values(model.reviewer.verdicts).reduce(
    (/** @type {Record<string, number>} */ tally, verdict) => {
      tally[String(verdict)] = (tally[String(verdict)] ?? 0) + 1;
      return tally;
    },
    {},
  );
  return [
    `- **Classifier** — ${
      classes.length > CLASSES
        ? `${classes.slice(0, CLASSES).join(", ")}, and ${classes.length - CLASSES} more`
        : classes.join(", ") || "no changed files"
    }`,
    `- **Gate** — blocks ${cell(model.gate.blocks.join(", ") || "none")}; warns ${cell(model.gate.warns.join(", ") || "none")}`,
    `- **Reviewer** — ${
      model.reviewer.present
        ? `ran on \`${cell(model.reviewer.sha ?? "an unnamed commit")}\`, ${
            Object.entries(verdicts)
              .map(([verdict, count]) => `${verdict} ${count}`)
              .join(", ") || "no verdicts"
          }`
        : "not supplied"
    }`,
  ];
}

/** @param {any} model */
function notChecked(model) {
  /** @type {string[]} */
  const notes = model.notChecked;
  if (notes.length === 0) return [];
  const shown = notes.slice(0, NOT_CHECKED).map((note) => `- ${cell(note)}`);
  return [
    "",
    "**Not checked**",
    ...shown,
    ...(notes.length > NOT_CHECKED
      ? [`- and ${notes.length - NOT_CHECKED} more`]
      : []),
  ];
}

/** Untrusted text inside a table cell: one line, and no cell break.
 * @param {unknown} value */
function cell(value) {
  return oneLine(value, 120).split("|").join("\\|");
}

/** The cap, applied last so the marker and the route always survive it.
 * @param {string[]} lines */
function trim(lines) {
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES - 1), "_…truncated_"];
}
