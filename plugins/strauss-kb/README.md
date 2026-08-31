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

Required: the plugin's MCP server (`strauss-kb-mcp`) and the CLI the skills
and hooks shell out to (`strauss-kb`) come from this one package and must be
the same version. See the [package README](../../packages/strauss-kb/README.md)
for the alternatives to a global install.

## Install

Claude Code:

```
/plugin marketplace add https://github.com/saasontools/strauss-agent-tools
/plugin install strauss-kb@saasontools
```

Codex: add the marketplace from `.agents/plugins/marketplace.json`, then
install `strauss-kb`.

The MCP server needs no install: it is launched with `npx` against
`@saasontools/strauss-kb@0.x`, so a session picks up each release without
anyone updating anything.

The **CLI is a separate matter**. The SessionStart hook runs `strauss-kb
context`, and the skill's examples shell out to `strauss-kb`, both resolved
from `PATH`. Install it, and keep it current:

```bash
npm install -g @saasontools/strauss-kb@latest
```

`strauss-kb --version` reports what is installed.

One resolution rule is worth knowing, because it decides which build actually
runs: `npx` prefers a project's `node_modules/.bin`, then a global binary of
the same name, and only fetches when neither exists. In a repo that depends on
this package the pinned copy wins — usually what that repo wants, but it means
`0.x` is a ceiling there, not a promise of latest.

Both runtimes launch the binary off a global install rather than through
`npx`, so install the package too — and keep it current, because the plugin
and the package update from different places and neither prompts for the
other:

```bash
npm install -g @saasontools/strauss-kb@^0.1.6
```

Skew is quiet by design: the SessionStart hook fails open, so an outdated
binary produces no output rather than an error. `strauss-kb --version` reports
what is installed; the MCP server reports the same value as `serverInfo.version`.
This plugin is built against **0.1.6**.

## What it adds

**MCP server** — `strauss-kb-mcp` over stdio, no API key, one tool per
command (`kb_load`, `kb_query`, `kb_write`, … see the package README).

**Skill** — `knowledge-base`: how to read standing, load before search, when
to write. Skills are re-read where conversations are not, so this survives
compaction.

**SessionStart hook** — runs `strauss-kb context` at every context birth.
`startup|resume|clear` use the `session-start` profile (small bases arrive
whole); `compact` uses the tighter `compact` profile (index only). Fails
open: no pins or no CLI means no output, no noise. Budgets and per-pin
behavior are configured in the repo's `.strauss/kb-pins.json`, not in the
hook:

```json
{
  "pins": [
    { "path": "docs/adr", "mode": "full" },
    { "path": "docs/kb", "profiles": ["session-start"] }
  ],
  "context": {
    "session-start": { "fullUnderTokens": 3000 },
    "compact": { "budgetTokens": 1500 }
  }
}
```

Pin options (`mode`, `profiles`, `frozen`), the local/user manifest layers,
and budget resolution are documented in the
[package README](../../packages/strauss-kb/README.md#living-in-an-agent-session).

**PostToolUse validate hook** — after any tool edit (`Write`, `Edit`, or
`MultiEdit` — a `Bash` write, e.g. `echo > INDEX.md`, is a known side door;
see below) whose file path lands inside a bundle (a `.kb` directory, or
`.strauss/kb`, and only a directory that actually looks like one — has a
record or a store-owned file in it already, so a coincidentally-named empty
directory doesn't cost a subprocess), runs `strauss-kb --bundle <dir>
validate` against it and, if that finds problems, surfaces them to the agent
as additional context (each problem's fields are flattened to one line and
capped at 200 characters — a validate note can quote a record's own
frontmatter verbatim, so this is the boundary against a crafted record
turning into a second prompt-injection hop through the hook's own output).
Hand edits skip the store's write path (`kb_write`, `kb_supersede`, …),
which is what keeps supersession links, backlinks, and `INDEX.md` in
agreement with each other — this hook is how a broken agreement gets
noticed right away instead of on some later read. Non-blocking: the edit
already happened by the time `PostToolUse` fires, and a hand edit is often
deliberate, so this informs rather than reverts or gates anything.

The CLI is resolved in three tiers, nearest first: this project's own
`node_modules/.bin/strauss-kb` (walked up from the edit's working directory,
the way Node resolves `node_modules`), then a global install on `PATH`,
then `npx` against the plugin's own pinned exact version of
`@saasontools/strauss-kb` — never a floating range, so a hand edit never
quietly runs whatever the registry happens to serve that day. (The pin is a
hand-kept constant in the hook script, and a package test fails if it drifts
from `packages/strauss-kb/package.json`.) A tier that never started at all
(not on `PATH`, no local install) falls through to the next one; a tier that
_did_ start but ran past its timeout does not — retrying a slow operation
through an even slower path just compounds the wait. On any other failure
(nothing resolvable, no bundle at that path yet, unexpected error) it fails
open — no output, no noise.

Opt out per project (`.claude/settings.json`'s `env`) or per session:

```bash
export STRAUSS_KB_NO_VALIDATE_HOOK=1
```

(`0`, `false`, and unset all mean "not opted out" — only a truthy value
disables the hook.)

**PreToolUse deny-generated-edits hook** — denies a `Write`/`Edit`/
`MultiEdit` that targets `INDEX.md`, `log.jsonl`, or the search index
_directly inside_ a bundle root (not a same-named file nested deeper, which
isn't store-owned): those are generated by the store's write path, and a
hand edit is silently overwritten by the next write. The reason is returned
as the permission decision, so the agent sees why and edits the underlying
record instead. This check is independent of `STRAUSS_KB_NO_VALIDATE_HOOK` —
that variable names the validate hook specifically; disable this one the
ordinary way (Claude Code's own hook settings) if a project genuinely needs
to hand-edit a generated file.

Both hooks share a known limitation: **only the two conventional directory
names are recognised** (a directory literally named `.kb`, or `.strauss/kb`)
— a base pinned somewhere else via `.strauss/kb-pins.json` (or its local/user
layers; `docs/kb`, `docs/adr`, …) is invisible to them. This is a deliberate
v1 scope cut, not an oversight: covering pinned bases would mean reading and
parsing those manifest layers — filesystem I/O and JSON parsing — on every
single tool edit in the project, for a check whose entire value depends on
being cheap enough to run unconditionally. Widening the matcher to catch
`Bash` writes too was considered and rejected for the same reason
[the read-blocking hook](#blocking-raw-kb-reads-opt-in) rejects it: shell
commands aren't parsed, deliberately, so a matcher wide enough to catch `cat

> > INDEX.md`would also be wide enough to false-positive on any`Bash` call
> > that merely mentions a bundle path in passing.

## Blocking raw KB reads (opt-in)

Record files must be read through the tools — a superseded record file reads
exactly like a current one. The plugin does not enforce this by itself
(blocking reads is workspace policy); pick one:

1. **Deny rules** — no script, in `.claude/settings.json`. Preferred. Static:
   add a line per pinned base.

   ```json
   {
     "permissions": {
       "deny": ["Read(.strauss/kb/**)", "Read(docs/kb/**)"]
     }
   }
   ```

2. **The shipped hook script** — follows the pin manifests automatically and
   tells the model _why_ at the point of violation instead of a silent deny.
   Copy [`hooks/scripts/block-kb-reads.mjs`](./hooks/scripts/block-kb-reads.mjs)
   (self-contained, node builtins only) to `.claude/hooks/` and add:

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

   Widen the matcher to `"Read|Glob|Grep"` to also catch searches whose
   explicit `path` points into a base. The script blocks `INDEX.md` too,
   allows pathless searches rather than over-blocking, and fails open on
   anything unexpected.

Known side door: Bash (`cat .strauss/kb/x.md`). Neither option parses shell
commands, deliberately — the skill and tool descriptions are the mitigation.

## Other runtimes

[adapters/](./adapters/) carries [Codex CLI](./adapters/codex/) (SessionStart
hooks incl. `compact`, AGENTS.md sentinel block) and
[Antigravity CLI](./adapters/antigravity/) (a full plugin: per-turn injection,
opt-in read blocking, rules file). The cross-runtime constant is
`strauss-kb sync-instructions AGENTS.md`.

`STRAUSS_KB_ACTOR` names the writer in each base's `log.jsonl`.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
