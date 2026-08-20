# StraussKb plugin

Keep durable project knowledge as markdown records with standing, supersession,
and trace.

One directory, three plugin formats — nothing collides:

| Client                                                                 | Manifest                     | Skills    | MCP config  |
| ---------------------------------------------------------------------- | ---------------------------- | --------- | ----------- |
| Agent Plugins 1.0 (ChatGPT, Codex CLI, Cursor, Copilot, VS Code, Kiro) | `plugin.json`                | `skills/` | `mcp.json`  |
| Claude Code                                                            | `.claude-plugin/plugin.json` | `skills/` | `.mcp.json` |
| Codex                                                                  | `.codex-plugin/plugin.json`  | `skills/` | `.mcp.json` |

## Prerequisite

```bash
npm install -g @saasontools/strauss-kb
```

This is required, not optional. Both surfaces the plugin exposes come from that
one package — the MCP server `strauss-kb-mcp` and the `strauss-kb` CLI that the
skills shell out to — and they must be the same installed version. Launching the
server through `npx` while the skills call a globally installed CLI would put two
versions of the same store in one session.

See the [package README](../../packages/strauss-kb/README.md) for why a global
install is the supported path, and for the two alternatives that also work.

## Install

### Claude Code

```
/plugin marketplace add https://github.com/saasontools/strauss-agent-tools
/plugin install strauss-kb@saasontools
```

### Codex

Add the marketplace from this repository (`.agents/plugins/marketplace.json`),
then install `strauss-kb`.

## What it adds

**MCP server** — `strauss-kb-mcp` over stdio, no API key and no required
environment. Fifteen tools, one per command: `kb_load`, `kb_query`, `kb_trace`,
`kb_write`, `kb_write_decision`, `kb_no_decision`, `kb_status`, `kb_supersede`,
`kb_answer`, `kb_list`, `kb_index`, `kb_log`, `kb_validate`, `kb_schema`,
`kb_types`.

**Skills**

| Skill            | For                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `knowledge-base` | Reading and writing records: what standing means, load before search, why a rejected record is never an answer. |

Skills are re-read where conversations are not, so the doctrine in them — pin,
reload at point of use, the index is not the content — persists across
compaction.

**Hooks** (`hooks/hooks.json`, Claude Code)

**SessionStart** — the one hook the plugin wires up. Runs `strauss-kb context`
at every context birth. Two matcher groups: `startup|resume|clear` uses
`--profile session-start` (budget 4000, full-under 1500 — tiny bases arrive
whole at a fresh start); `compact` uses `--profile compact` (index-only at
2500, because the block is competing with a summary for a smaller window).
Those are built-in defaults, not the hook's numbers: a repo overrides them per
profile in its own `.strauss/kb-pins.json`, so the plugin never needs editing —

```json
{
  "pins": [
    { "path": "docs/adr", "mode": "full" },
    { "path": "docs/kb", "profiles": ["session-start"] }
  ],
  "context": {
    "default": { "budgetTokens": 6000 },
    "session-start": { "fullUnderTokens": 3000 },
    "compact": { "budgetTokens": 1500 }
  }
}
```

Per pin: `mode: "full"` preloads the base whole regardless of the full-under
threshold (still under the block budget — a labelled index fallback when it
cannot fit), `mode: "index"` never upgrades, and `profiles` scopes the pin to
named profiles (a base per-turn injection shouldn't carry, say).

Resolution, most specific wins: explicit flags → the manifest's profile entry →
its `default` entry → the built-in profile → package defaults. Invalid values
are ignored rather than errors — a typo in a budget must not silence the index.
Fail open by construction: no manifest, no pins, or no CLI installed produces
no output and exit 0 (`2>/dev/null || true`) — zero noise.

**File-read blocking is opt-in, not wired by the plugin.** Blocking `Read` on
project paths is a workspace policy, not something a plugin should impose on
every project it is installed into — so the plugin ships the enforcement script
(`hooks/scripts/block-kb-reads.mjs`) and you choose where, and how much, to
apply it. Three tiers, most granular first — **prefer tier 1**: plain
permissions cover Read and Grep by path with no script and no hook latency;
the script earns its place only when pins change often enough that static
rules would drift, or when you want the model redirected with the why rather
than silently denied:

1. **Deny rules, per base** — no script, plain permissions, scoped to exactly
   the paths you name. In the project's `.claude/settings.json`:

   ```json
   {
     "permissions": {
       "deny": ["Read(.strauss/kb/**)", "Read(docs/kb/**)"]
     }
   }
   ```

   Precise but static: it does not follow `.strauss/kb-pins.json`, so add a
   line per pinned base.

2. **The script, Read only** — follows the pin manifest automatically and
   redirects the model at the point of violation. Copy
   [`hooks/scripts/block-kb-reads.mjs`](./hooks/scripts/block-kb-reads.mjs)
   into the project as `.claude/hooks/block-kb-reads.mjs` — it is
   self-contained (node builtins only) precisely so it can be copied;
   `${CLAUDE_PLUGIN_ROOT}` resolves only inside a plugin's own hooks.json, so
   project settings need a project-local path. Then in
   `.claude/settings.json`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Read",
           "hooks": [
             {
               "type": "command",
               "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-kb-reads.mjs\""
             }
           ]
         }
       ]
     }
   }
   ```

3. **The script, wide** — same entry with matcher `"Read|Glob|Grep"`, catching
   searches whose explicit `path` points into a base too.

What the script does when it fires: resolves the target path (relative,
absolute, `..`-traversal) and, when it falls inside `.strauss/kb` or any base
pinned in `.strauss/kb-pins.json`, exits 2 with the redirect on stderr, which
reaches the model at the exact point of violation:

> KB directories are read via strauss-kb tools only (kb_load / kb_query /
> kb_trace) — file reads bypass supersession resolution and return replaced
> records as if current.

`INDEX.md` is blocked along with the records, for uniformity — the agent gets
the index through `kb_context` / `kb_index`. A `Grep`/`Glob` with no explicit
path is allowed rather than over-blocking every project-wide search. Everything
unexpected — malformed stdin, unreadable manifest — fails open; a broken hook
must never lock an agent out of its project.

**Known side door: Bash.** Neither tier parses shell commands for KB paths
(`cat .strauss/kb/x.md` gets through), deliberately. The deny rules, the skill,
and the tool descriptions are the mitigation.

**Adapters for other runtimes** live in [adapters/](./adapters/):
[Codex CLI](./adapters/codex/) (SessionStart hooks incl. `compact`, AGENTS.md
sentinel block) and [Antigravity CLI](./adapters/antigravity/) (a full plugin:
per-turn PreInvocation injection, opt-in read blocking, rules file). The
cross-runtime constant is `strauss-kb sync-instructions AGENTS.md`.

`STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`; it defaults to
`mcp` for the server and `unknown` for the CLI.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
