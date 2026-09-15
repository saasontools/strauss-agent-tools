// @ts-check
/**
 * The reviewer gate's pure half: who is asking, what the command would do to
 * the base, and whether the roster lets this reviewer do it. No I/O here
 * beyond the two readers the entry passes in, so every rule is a unit test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./util.mjs";

/** Verbs that change the base. Anything else is a read and passes. */
export const WRITE_VERBS = new Set([
  "write",
  "write-decision",
  "no-decision",
  "status",
  "supersede",
  "answer",
  "verify",
  "anchor-resolve",
  "reassess",
  "stamp",
  "pin",
  "unpin",
  "promote",
  "sweep",
  "sync-instructions",
]);

/** Writes no reviewer makes: they decide, settle, or reshape the base. */
export const FORBIDDEN_VERBS = new Set([
  "write-decision",
  "no-decision",
  "supersede",
  "reassess",
  "stamp",
  "pin",
  "unpin",
  "promote",
  "sweep",
  "sync-instructions",
]);

/** Statuses that settle a record. */
const SETTLING = new Set(["accepted", "resolved", "rejected"]);

const MCP_WRITE =
  /^mcp__.*strauss[-_]kb.*__kb_(write|write_decision|no_decision|status|supersede|answer|verify|anchor_resolve|reassess|stamp|pin|unpin|promote|sweep)$/;

const MCP_LOAD = /^mcp__.*strauss[-_]kb.*__kb_load$/;

/** Whether this tool call loads the base: the MCP `kb_load`, or the CLI verb.
 * @param {string} toolName @param {string | null} command */
export function isLoad(toolName, command) {
  if (MCP_LOAD.test(toolName)) return true;
  return !!command && kbCalls(command).some((call) => call.verb === "load");
}

/**
 * @typedef {{ tags?: string[], paths?: string[], mayBlock?: boolean }} RosterEntry
 * @typedef {{ name: string, actor: string, entry: RosterEntry }} Reviewer
 * @typedef {{ verb: string, args: string[], actor: string | null, text: string }} KbCall
 */

/**
 * The reviewer this payload runs as, or null when the roster does not name
 * it. `agent_type` is what Claude Code hands a subagent's hooks, `name` or
 * `agent_name` what Codex may; `STRAUSS_KB_REVIEWER` is the door for a client
 * that hands nothing.
 * @param {any} input @param {Record<string, unknown> | null} roster
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Reviewer | null}
 */
export function reviewerOf(input, roster, env = process.env) {
  const carried = [input?.agent_type, input?.agent_name, input?.name].find(
    (value) => typeof value === "string" && value,
  );
  const name = carried ?? (env.STRAUSS_KB_REVIEWER || null);
  if (!name || !roster) return null;
  const entry = roster[name];
  if (!entry || typeof entry !== "object") return null;
  return {
    name,
    actor: `agent:${name}`,
    entry: /** @type {RosterEntry} */ (entry),
  };
}

/** `reviewers` from `.strauss/kb-pins.json`, or null.
 * @param {string} repoRoot @returns {Record<string, unknown> | null} */
export function rosterOf(repoRoot) {
  try {
    const pins = JSON.parse(
      readFileSync(join(repoRoot, ".strauss", "kb-pins.json"), "utf8"),
    );
    return pins?.reviewers && typeof pins.reviewers === "object"
      ? pins.reviewers
      : null;
  } catch {
    return null;
  }
}

/**
 * Every `strauss-kb <verb>` in a shell command, with the actor in force on
 * it: the assignment on its own segment, else the last `export` or bare
 * assignment on an earlier one. Segments split on `&&`, `||`, `;`, `|` and
 * newlines; a heredoc's body never names the CLI, so splitting through it is
 * harmless.
 * @param {string} command @returns {KbCall[]}
 */
export function kbCalls(command) {
  /** @type {KbCall[]} */
  const calls = [];
  /** @type {string | null} */
  let exported = null;
  for (const segment of command.split(/&&|\|\||;|\||\r?\n/)) {
    const actorMatch = /STRAUSS_KB_ACTOR=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(
      segment,
    );
    const here = actorMatch
      ? (actorMatch[1] ?? actorMatch[2] ?? actorMatch[3] ?? null)
      : null;
    const match =
      /(?:^|\s)(?:strauss-kb|[^\s]*cli-main\.js|[^\s]*\/\.bin\/strauss-kb)\s+([a-z-]+)((?:\s+[^\s<]+)*)/.exec(
        segment,
      );
    if (!match) {
      // `export STRAUSS_KB_ACTOR=x` or `STRAUSS_KB_ACTOR=x` alone: in force
      // for what follows.
      if (here && /^\s*(?:export\s+)?STRAUSS_KB_ACTOR=/.test(segment)) {
        exported = here;
      }
      continue;
    }
    calls.push({
      verb: match[1] ?? "",
      args: (match[2] ?? "").trim().split(/\s+/).filter(Boolean),
      actor: here ?? exported,
      text: segment,
    });
  }
  return calls;
}

/** `generated.by` of a record, or null when unreadable.
 * @param {string} bundle @param {string} conceptId */
export function recordAuthor(bundle, conceptId) {
  if (!/^[a-z-]+\.[A-Za-z0-9._-]+$/.test(conceptId)) return null;
  try {
    const { data } = parseFrontmatter(
      readFileSync(join(bundle, `${conceptId}.md`), "utf8"),
    );
    const generated = /** @type {any} */ (data).generated;
    return typeof generated?.by === "string" ? generated.by : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {{
 *   reviewer: Reviewer,
 *   toolName: string,
 *   command: string | null,
 *   loaded: boolean,
 *   authorOf: (conceptId: string) => string | null,
 *   preflight: () => string | null,
 * }} Decision
 */

/**
 * The reason to deny this tool call, or null to let it through. `loaded` is
 * whether this reviewer has loaded the base; `preflight` runs only once a
 * write is about to be allowed, so reads never pay for it.
 * @param {Decision} d @returns {string | null}
 */
export function denyReason(d) {
  const { reviewer, toolName, command } = d;
  if (MCP_WRITE.test(toolName)) {
    return `strauss-kb reviewer gate: MCP writes land as actor "mcp". Run the CLI with STRAUSS_KB_ACTOR=${reviewer.actor} instead.`;
  }
  if (!command) return null;
  const writes = kbCalls(command).filter((call) => WRITE_VERBS.has(call.verb));
  if (writes.length === 0) return null;
  for (const call of writes) {
    const reason = ruleFor(call, d);
    if (reason) return `strauss-kb reviewer gate: ${reason}`;
  }
  if (!d.loaded) {
    return "strauss-kb reviewer gate: load the base before writing to it: kb_load, or strauss-kb load.";
  }
  const failed = d.preflight();
  return failed
    ? `strauss-kb reviewer gate: unvalidated-base — write nothing, report it, route to kb-fix.\n${failed}`
    : null;
}

/** @param {KbCall} call @param {Decision} d */
function ruleFor(call, d) {
  const { reviewer } = d;
  if (call.actor !== reviewer.actor) {
    return `writes carry your own actor. Prefix the command with STRAUSS_KB_ACTOR=${reviewer.actor} (found ${call.actor ? JSON.stringify(call.actor) : "none"}).`;
  }
  if (FORBIDDEN_VERBS.has(call.verb)) {
    return `\`${call.verb}\` is not a reviewer's write. Decisions are the author's; a dispute is an open-question beside the record.`;
  }
  if (call.verb === "write") {
    if (call.args[0] === "decision") {
      return "a reviewer never writes a decision. Write an open-question owned by the author instead.";
    }
    if (
      /"materiality"\s*:\s*"blocking"/.test(d.command ?? "") &&
      reviewer.entry.mayBlock !== true
    ) {
      return `"${reviewer.name}" has no mayBlock on the roster. Write it as important and say why it should block.`;
    }
    return null;
  }
  if (call.verb === "status" || call.verb === "answer") {
    const id = call.args[0] ?? "";
    const author = d.authorOf(id);
    if (author && author !== reviewer.actor) {
      return `${id} was written by ${author}. Settling it is theirs or a human's; your dispute is an open-question.`;
    }
    if (call.verb === "status" && SETTLING.has(call.args[1] ?? "")) {
      return `${id} is yours, and its writer does not settle it. Leave it open for the author or a human.`;
    }
  }
  return null;
}

/**
 * The last assistant text in a Claude-shaped transcript, or null when the
 * file is missing or has none. Codex hands `null` as the path.
 * @param {string | null | undefined} path
 */
export function lastAssistantText(path) {
  if (!path) return null;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let last = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.type !== "assistant") continue;
      const content = entry.message?.content;
      const parts = Array.isArray(content)
        ? content
            .filter((part) => part?.type === "text")
            .map((part) => String(part.text ?? ""))
        : typeof content === "string"
          ? [content]
          : [];
      if (parts.length > 0) last = parts.join("\n");
    } catch {
      // A malformed line is not the last message.
    }
  }
  return last;
}

/** Whether a review ended with its `kb` report block.
 * @param {string | null} text */
export function hasReportBlock(text) {
  return typeof text === "string" && /^```kb\s*$/m.test(text);
}
