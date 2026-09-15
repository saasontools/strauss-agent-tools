// @ts-check
/** The reviewer gate: roster identity, the write rules, pre-flight, Stop. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { main } from "./kb-reviewer-gate.mjs";
import {
  denyReason,
  hasReportBlock,
  isLoad,
  kbCalls,
  lastAssistantText,
  reviewerOf,
} from "./lib/reviewer.mjs";
import { statePath } from "./lib/state.mjs";

const ROSTER = {
  security: { tags: ["review:security"], mayBlock: true },
  perf: { tags: ["review:performance"] },
};

/** @param {string} name */
function reviewer(name) {
  const found = reviewerOf({ agent_type: name }, ROSTER);
  assert.ok(found, `${name} is on the roster`);
  return found;
}

/** @param {Partial<import("./lib/reviewer.mjs").Decision>} over */
function decide(over) {
  return denyReason({
    reviewer: reviewer("security"),
    toolName: "Bash",
    command: null,
    loaded: true,
    authorOf: () => null,
    preflight: () => null,
    ...over,
  });
}

test("isLoad: the MCP kb_load or the CLI load verb", () => {
  assert.equal(
    isLoad("mcp__plugin_strauss-kb_strauss-kb__kb_load", null),
    true,
  );
  assert.equal(isLoad("Bash", "strauss-kb load --bundle .strauss/kb"), true);
  assert.equal(isLoad("Bash", "strauss-kb query --tag review"), false);
  assert.equal(isLoad("mcp__strauss-kb__kb_query", null), false);
});

test("a write before the base is loaded is denied", () => {
  const reason = decide({
    command:
      "STRAUSS_KB_ACTOR=agent:security strauss-kb verify risk.a --note ok",
    loaded: false,
  });
  assert.match(String(reason), /load the base/);
  // `--check` writes nothing, so it needs neither a load nor the actor.
  assert.equal(
    decide({
      command: "strauss-kb anchor-resolve risk.a --check",
      loaded: false,
    }),
    null,
  );
  assert.equal(
    decide({ command: "strauss-kb query --tag review", loaded: false }),
    null,
  );
});

test("identity: agent_type, then STRAUSS_KB_REVIEWER, and only on the roster", () => {
  assert.equal(
    reviewerOf({ agent_type: "security" }, ROSTER)?.actor,
    "agent:security",
  );
  assert.equal(
    reviewerOf({}, ROSTER, { STRAUSS_KB_REVIEWER: "perf" })?.name,
    "perf",
  );
  assert.equal(
    reviewerOf({ name: "security" }, ROSTER, {})?.actor,
    "agent:security",
  );
  assert.equal(reviewerOf({ agent_name: "perf" }, ROSTER, {})?.name, "perf");
  assert.equal(reviewerOf({ agent_type: "author" }, ROSTER), null);
  assert.equal(reviewerOf({ agent_type: "security" }, null), null);
  assert.equal(reviewerOf({}, ROSTER, {}), null);
});

test("kbCalls: verb, args and the actor on the same segment", () => {
  const calls = kbCalls(
    'cd repo && STRAUSS_KB_ACTOR="agent:security" strauss-kb verify decision.x --note "read it" | tee out',
  );
  assert.deepEqual(
    calls.map((c) => [c.verb, c.args[0], c.actor]),
    [["verify", "decision.x", "agent:security"]],
  );
  const heredoc = kbCalls(
    'STRAUSS_KB_ACTOR=agent:security strauss-kb write risk <<\'JSON\'\n{ "slug": "x" }\nJSON',
  );
  assert.equal(heredoc.length, 1);
  assert.deepEqual(heredoc[0]?.args, ["risk"]);
  assert.equal(
    kbCalls(
      "export STRAUSS_KB_ACTOR=agent:security; strauss-kb verify risk.a --note ok",
    )[0]?.actor,
    "agent:security",
  );
  assert.equal(
    kbCalls(
      "STRAUSS_KB_ACTOR=agent:author\nstrauss-kb verify risk.a --note ok",
    )[0]?.actor,
    "agent:author",
  );
  assert.equal(
    kbCalls(
      "echo STRAUSS_KB_ACTOR=agent:security && strauss-kb verify risk.a",
    )[0]?.actor,
    null,
  );
  assert.equal(kbCalls("strauss-kb query --tag review").length, 1);
  assert.equal(kbCalls("git status").length, 0);
  assert.equal(
    kbCalls(
      "node ./node_modules/@saasontools/strauss-kb/dist/cli-main.js status risk.a open",
    )[0]?.verb,
    "status",
  );
});

test("reads pass without pre-flight; writes need the reviewer's actor", () => {
  let ran = 0;
  const preflight = () => {
    ran += 1;
    return null;
  };
  assert.equal(
    decide({ command: "strauss-kb match --git main..HEAD", preflight }),
    null,
  );
  assert.equal(ran, 0);
  assert.match(
    String(
      decide({ command: "strauss-kb write risk <<'J'\n{}\nJ", preflight }),
    ),
    /STRAUSS_KB_ACTOR=agent:security \(found none\)/,
  );
  assert.match(
    String(
      decide({
        command:
          "STRAUSS_KB_ACTOR=agent:author strauss-kb write risk <<'J'\n{}\nJ",
      }),
    ),
    /found "agent:author"/,
  );
  assert.equal(
    decide({
      command:
        "STRAUSS_KB_ACTOR=agent:security strauss-kb write risk <<'J'\n{}\nJ",
      preflight,
    }),
    null,
  );
  assert.equal(ran, 1);
});

test("a reviewer never decides, settles, or reshapes the base", () => {
  const own = "STRAUSS_KB_ACTOR=agent:security strauss-kb";
  assert.match(
    String(decide({ command: `${own} write decision <<'J'\n{}\nJ` })),
    /never writes a decision/,
  );
  assert.match(
    String(decide({ command: `${own} write-decision <<'J'\n{}\nJ` })),
    /not a reviewer's write/,
  );
  assert.match(
    String(decide({ command: `${own} supersede risk.a risk.b` })),
    /not a reviewer's write/,
  );
  assert.match(
    String(decide({ command: `${own} promote risk.a --to ../kb` })),
    /not a reviewer's write/,
  );
  assert.equal(
    decide({ command: `${own} anchor-resolve decision.a --rebaseline` }),
    null,
  );
  assert.equal(decide({ command: `${own} verify decision.a --note ok` }), null);
});

test("blocking risks need mayBlock", () => {
  const blocking =
    'strauss-kb write risk <<\'J\'\n{ "materiality": "blocking" }\nJ';
  assert.equal(
    decide({ command: `STRAUSS_KB_ACTOR=agent:security ${blocking}` }),
    null,
  );
  assert.match(
    String(
      decide({
        reviewer: reviewer("perf"),
        command: `STRAUSS_KB_ACTOR=agent:perf ${blocking}`,
      }),
    ),
    /no mayBlock/,
  );
});

test("status and answer: another actor's record is theirs; your own is not settled by you", () => {
  const own = "STRAUSS_KB_ACTOR=agent:security strauss-kb";
  const authorOf = (/** @type {string} */ id) =>
    id.endsWith(".theirs")
      ? "agent:author"
      : id === "risk.mine"
        ? "agent:security"
        : null;
  assert.match(
    String(decide({ command: `${own} status risk.theirs resolved`, authorOf })),
    /written by agent:author/,
  );
  assert.match(
    String(
      decide({ command: `${own} answer open-question.theirs done`, authorOf }),
    ),
    /written by/,
  );
  assert.match(
    String(decide({ command: `${own} status risk.mine resolved`, authorOf })),
    /does not settle it/,
  );
  assert.equal(
    decide({ command: `${own} status risk.mine open`, authorOf }),
    null,
  );
});

test("MCP write tools are denied; MCP reads pass", () => {
  assert.match(
    String(decide({ toolName: "mcp__strauss-kb__kb_write" })),
    /land as actor "mcp"/,
  );
  assert.match(
    String(
      decide({ toolName: "mcp__plugin_strauss-kb_strauss-kb__kb_verify" }),
    ),
    /MCP writes/,
  );
  assert.equal(decide({ toolName: "mcp__strauss-kb__kb_query" }), null);
});

test("an unvalidated base denies the write with the report", () => {
  const reason = decide({
    command:
      "STRAUSS_KB_ACTOR=agent:security strauss-kb write risk <<'J'\n{}\nJ",
    preflight: () => "validate: exit 1\nbroken link decision.a -> risk.z",
  });
  assert.match(String(reason), /unvalidated-base/);
  assert.match(String(reason), /broken link/);
});

test("transcript: the last assistant text, and the kb block in it", () => {
  const dir = mkdtempSync(join(tmpdir(), "reviewer-gate-"));
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    [
      JSON.stringify({ type: "user", message: { content: "review" } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "first" }] },
      }),
      "not json",
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "done\n```kb\n{}\n```\n" }],
        },
      }),
    ].join("\n"),
  );
  const text = lastAssistantText(path);
  assert.equal(text, "done\n```kb\n{}\n```\n");
  assert.equal(hasReportBlock(text), true);
  assert.equal(hasReportBlock("first"), false);
  assert.equal(lastAssistantText(null), null);
  rmSync(dir, { recursive: true, force: true });
});

test("main: non-roster payloads pass, a roster Stop without the block is blocked", async () => {
  const repo = mkdtempSync(join(tmpdir(), "reviewer-gate-repo-"));
  mkdirSync(join(repo, ".strauss"), { recursive: true });
  writeFileSync(
    join(repo, ".strauss", "kb-pins.json"),
    JSON.stringify({ reviewers: ROSTER }),
  );
  const transcript = join(repo, "t.jsonl");
  writeFileSync(
    transcript,
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "no block" }] },
    }),
  );
  /** @type {string[]} */
  const out = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = /** @type {any} */ (
    (/** @type {unknown} */ chunk) => {
      out.push(String(chunk));
      return true;
    }
  );
  try {
    assert.equal(
      await main([], () =>
        JSON.stringify({
          hook_event_name: "Stop",
          cwd: repo,
          agent_type: "author",
          transcript_path: transcript,
        }),
      ),
      0,
    );
    assert.equal(out.length, 0);
    assert.equal(
      await main([], () =>
        JSON.stringify({
          hook_event_name: "Stop",
          cwd: repo,
          agent_type: "security",
          transcript_path: transcript,
        }),
      ),
      0,
    );
    assert.equal(JSON.parse(out[0] ?? "{}").decision, "block");
    out.length = 0;
    assert.equal(
      await main([], () =>
        JSON.stringify({
          hook_event_name: "PreToolUse",
          cwd: repo,
          agent_type: "security",
          tool_name: "Bash",
          tool_input: { command: "strauss-kb write risk <<'J'\n{}\nJ" },
        }),
      ),
      0,
    );
    assert.equal(
      JSON.parse(out[0] ?? "{}").hookSpecificOutput.permissionDecision,
      "deny",
    );
    assert.equal(await main([], () => "not json"), 0);

    // With a base present, a Stop needs a load first; a kb_load unlocks it.
    mkdirSync(join(repo, ".strauss", "kb"));
    const done = join(repo, "done.jsonl");
    writeFileSync(
      done,
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "```kb\n{}\n```" }] },
      }),
    );
    const session = basename(repo);
    const stop = () =>
      main([], () =>
        JSON.stringify({
          hook_event_name: "Stop",
          cwd: repo,
          session_id: session,
          agent_type: "security",
          transcript_path: done,
        }),
      );
    out.length = 0;
    await stop();
    assert.match(String(JSON.parse(out[0] ?? "{}").reason), /Load the base/);
    out.length = 0;
    await main([], () =>
      JSON.stringify({
        hook_event_name: "PreToolUse",
        cwd: repo,
        session_id: session,
        agent_type: "security",
        tool_name: "mcp__strauss-kb__kb_load",
        tool_input: {},
      }),
    );
    await stop();
    assert.equal(out.length, 0);
    rmSync(statePath(`${session}.reviewer.security`), { force: true });
  } finally {
    process.stdout.write = write;
    rmSync(repo, { recursive: true, force: true });
  }
});
