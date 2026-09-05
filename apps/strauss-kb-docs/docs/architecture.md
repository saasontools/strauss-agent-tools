---
id: architecture
title: Architecture
sidebar_label: Architecture
sidebar_position: 3
description: Why strauss-kb is shaped the way it is, and which alternatives were tried and dropped.
---

# Architecture

The [Specification](./specification.md) says what the format is. This says why it
is shaped that way, and which alternatives were tried and dropped.

## One command set, two surfaces

Every operation a base exposes is defined once, in a command table
(`src/commands/`). The CLI and the MCP server are both **projections** of it.

```
                    src/commands/index.ts
                      KB_COMMANDS[]
                     /             \
              src/cli.ts          src/mcp.ts
          argv → fromArgv →       args → input.parse →
              command.run             command.run
```

Kept apart they drift within a day — fourteen commands against six tools. A
command added to the table appears in both surfaces or in neither, and a test
asserts that. The table holds 24 verbs and 23 tools.

Each command carries:

| Field         | What it is                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `name`        | the CLI verb                                                            |
| `tool`        | the MCP tool name, absent only for CLI-only plumbing                    |
| `usage`       | the argument spelling, for CLI help                                     |
| `description` | shown to an agent choosing a tool, so it carries the judgment too       |
| `input`       | a Zod object — the MCP input schema and the CLI's validator             |
| `fromArgv`    | the only per-surface code: positional argv → the same object MCP passes |
| `run`         | the operation, over `{ store, actor, now }`                             |
| `render`      | the human-readable form, for the verbs that print a table. CLI-only     |
| `failsWhen`   | turns a result — and the parsed input — into a non-zero CLI exit        |

`sync-instructions` is the one verb with no `tool`: it edits files for hooks and
instruction blocks rather than giving an agent a capability.

`failsWhen` exists because a check that reports a problem has _succeeded_ as a
command and _failed_ as a check; it receives the parsed input too, which lets
`doctor --strict` gate on a flag the report is indifferent to. `render` is the
CLI's alone, which is why `--json` is **refused** on a verb without one.

## Folder modules

A source file that accumulates more than one responsibility becomes a directory
of single-responsibility modules with an `index.ts` barrel re-exporting the
public surface. Importers point at the barrel.

| Module           | Shape                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/`  | `model.ts` (the `KbCommand` type and shared Zod pieces), one file per command, `index.ts` assembling `KB_COMMANDS`              |
| `src/kb-pins/`   | `model.ts` (manifest schemas), `layers.ts`, `budgets.ts`, `frozen.ts`, `errors.ts`, `pin.ts`, `unpin.ts`, `list.ts`, `index.ts` |
| `src/kb-links/`  | `model.ts` (the inbound-edge types), `inbound.ts` (the index), `impact.ts`, `backlinks.ts`, `index.ts`                          |
| `src/telemetry/` | `model.ts` (the event schema), `sinks.ts` (the three destinations), `emit.ts`, `summary.ts` (the read side), `index.ts`         |
| `src/classify/`  | `model.ts` (the class set and options), `rules.ts` (the path table and shapes), `classify.ts`, `index.ts`                       |

`index.ts`'s command order is the CLI usage listing's order: the write path, the
read path, base housekeeping, the format, then the workspace pin verbs.

## The store

`KbStore` reads and writes a bundle. It is framework-free on purpose — its
consumers are a library caller, a CLI, and an MCP server, so it takes a logger
rather than reaching for one — and addresses the bundle by path.

### One record per file

The filename is the identity, so two writers never merge; they only choose
distinct names, and a collision surfaces as a 409 rather than a silent
last-write-wins.

### Compare-and-swap rather than a lock

Read-modify-write (`setStatus`, `answer`) checks a content digest immediately
before publishing, narrowing the lost-update window to two adjacent syscalls
rather than closing it. A lock would close it and add a worse failure: a crashed
holder blocks every later writer, where a lost update costs one retry.

### Repair on read, not coordination

`INDEX.md` is a projection — every byte recomputable from frontmatter — which is
what lets parallel writers regenerate it without a lock. `log.jsonl` gets the
opposite treatment: it records events nothing else holds, so repair means detect
and report, never rewrite.

### Cross-worktree log safety

A committed base is routinely written from several worktrees at once, and the
answer is declarative rather than coordinated: a
[`merge=union` driver](./specification.md#gitattributes-and-cross-worktree-writes)
in the base's `.gitattributes`. A **lock** was rejected here for the same reason
as above, and the cost — reordered and occasionally duplicated lines — is
absorbed on the read side.

### Telemetry is a separate stream from the base log

`log.jsonl` records judgment — who wrote, verified or superseded which record —
and lives inside the base because that is part of what the base asserts.
Telemetry records operations: what ran, how long it took, and what it found.
Mixing them would put a CI run's noise into a base's history and make the log
rewritable, so telemetry goes to `~/.strauss/telemetry` instead, and the later
gate, reviewer and policy components share the stream through the same
[`emit`](./cli-reference.md#telemetry).

### The store is the sole accessor

Excluding store-owned files from listings and repairing the index on read hold
only while everything goes through one door; reading one record by a concept id
you already hold is the exception. This is also why a raw file read is not a
supported way to read a base: it bypasses supersession resolution. A workspace
can enforce that with deny rules or the plugin's opt-in `PreToolUse` script.

## The plugin's hooks

A hand-edit is the case that does not go through the store, and a `git pull` or
a sub-agent's write is the case an already-loaded base does not survive. The
plugin ships scripts for both.

| Event                  | Wired by      | What it does                                                                |
| ---------------------- | ------------- | --------------------------------------------------------------------------- |
| `SessionStart`         | the plugin    | emits the pinned-base context block                                         |
| `SessionStart`         | the workspace | seeds the session's stamp state                                             |
| `PostToolUse` (`Bash`) | the workspace | after a git sync, says which pinned base changed since it was loaded        |
| `SubagentStop`         | the workspace | the same compare, for a sub-agent's own write                               |
| `PreToolUse` (write)   | the workspace | **denies** an edit to a generated file inside a bundle                      |
| `PostToolUse` (write)  | the workspace | runs `validate` over the bundle a manual edit touched, and reports findings |

The context block is the only hook the plugin wires: it installs per user, so
anything in its `hooks.json` fires in every repo that user opens, including
ones with no kb. Copy the scripts a workspace wants to `.claude/hooks/` and add

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/kb-stamp-hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/deny-kb-generated-edits.mjs\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/validate-kb-bundle.mjs\"",
            "timeout": 65
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/kb-stamp-hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/kb-stamp-hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

Both write hooks decide whether the edited path is inside a base by a pure
path-segment match: a segment named `.kb`, or a segment `kb` whose parent is `.strauss`. A
base pinned somewhere else is invisible to them — a v1 scope cut.

**The deny hook** blocks `INDEX.md`, `log.jsonl`, and `.index.sqlite`, and only
directly in the bundle root, so a nested `notes/INDEX.md` is ordinary; its
reason says those files are generated and a direct edit will be overwritten.

**The validate hook** is advisory rather than blocking. It resolves the CLI in
three tiers, nearest first — a local `node_modules/.bin`, `strauss-kb` on
`PATH`, then a pinned `npx` — and only a tier that never _started_ falls through
to the next. Findings come back as additional context, capped and sanitized,
since validate notes can quote record frontmatter verbatim. It **fails open**
everywhere, exiting 0 and saying nothing when its own plumbing breaks.

**The reload hook** (`kb-stamp-hook.mjs`), opt-in for the same per-user
reason, keeps `$TMPDIR/strauss-kb/<session
id>.json` — the digest each pinned base carried when it was last injected,
beside the git head it was seen at. It never writes under the repo, and the
state file is replaced through a temp file and a rename. On a `Bash` command
matching `git (pull|fetch|merge|rebase|checkout|switch)` it answers from git
first: HEAD where the state file left it, or a `git diff --name-only` since
then that names no pinned path, exits before the CLI is spawned at all. Only
past that does it run `strauss-kb stamp --json`, compare digests, and name the
changed records. `SubagentStop` skips straight to the compare, since a
sub-agent's write moves no commit. Median cost of the path that exits on the
regex: **31 ms**, node startup and nothing else; a git sync that touched
nothing pinned, ~60 ms.

`STRAUSS_KB_NO_VALIDATE_HOOK` opts out, checked before stdin is even read. Only
a truthy value counts — `0`, `false`, and unset all mean "not opted out" — and
it names the **validate** hook specifically; the deny hook is disabled through
the runtime's own hook settings. Neither covers a `Bash` write: a matcher wide
enough to catch `INDEX.md` in a shell command would false-positive on any `Bash`
call that merely mentions it.

## The read pipeline

```
records on disk
   │
   ├─ compose      write-side: type spec → ordered sections + frontmatter
   │
   ├─ adjudicate   attach standing + warnings; resolve supersession heads
   │
   ├─ load/pack    budget, stub superseded records, refuse rather than truncate
   │
   └─ trace        walk supersession/anchor/source, order by generated.at
```

**`compose`** turns a type and an input object into one record; the type table
(`record-types.ts`) is data, so adding a type is an edit rather than a file.

**`adjudicate`** attaches standing rather than filtering: a filtered result set
is invisible, which turns a knowable gap into an unknowable one.

**`resolveHeads`** walks a supersession chain to whatever currently stands in
its place, following both directions because a hand-edit can leave one side
behind. It resolves at read time: a stored head would have to be rewritten on
every ancestor whenever a chain grows.

**`impact`** answers what breaks if a record changes. It is not "inbound links",
because the direction of dependence does not follow the direction of the edge,
so each hop asks two questions: who points at me with a rel whose dependant is
the source, and who do I point at with a rel whose dependant is the target. That
table is data, and `KB_CAUSAL_LINK_RELS` is **derived** from it by filtering out
the rels with no dependant.

The walks disagree about standing: `impact` reports a superseded or rejected
record and **stops there**, where `pack` and `trace` traverse regardless,
because a neighbourhood and a history both want the record that no longer holds.
Cycles are ordinary — `A depends_on B` with `B constrains A` is legitimate — so
a record is expanded once, keeps the shortest depth it was reached at, and
accumulates every edge that reached it.

**`trace`** is the inverse of a point query: in a query a `rejected` record is
the most dangerous thing retrievable, and in a history it is the content. It
orders by `generated.at` rather than by rank.

## Classes are derived, never stored

`classify` reads a class off the diff and the base never holds one, because a
stored class is a second copy of an answer the patch already gives and the two
disagree the first time a rule changes. The one input no script can derive —
"this output is generated, read its input instead" — is a `review:*` fact, and
that is the only part of the answer a record carries.

## Read for a question, not for a session

A base loaded at the start of a long conversation is summarised away by the end
of it, so no consumer loads it that way:

| Consumer                        | How it reads                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Diff annotation                 | `matchToDiff` — deterministic, no context involved                           |
| "Has this been decided?"        | a fresh short-lived reader, given the base and the question, discarded after |
| An implementor writing a record | a point query at the moment of writing, not a load an hour earlier           |

`kb_match` is that first row as a tool, so a reviewer, a gate, or a desktop
client gets the same answer without importing the package. It takes hunks
rather than a patch; the unified-diff parser the CLI's `--git` needs lives on
the command, not in the library.

Where a base must stay resident it will drift; the mitigation is that reloading
costs about three thousand tokens.

## What happens when a base outgrows a context

Loading stops working somewhere above a few hundred records, and what replaces
it is the same reader given candidates instead of everything:

```
vector recall  →  top ~20 candidates, with their scores
                  ↓
reader judges  →  picks what answers, or says nothing does
```

The reader stays the judge in both regimes, which preserves the two structural
wins: it can say no record answers the question, and it picks the record that
answers rather than the one nearest the topic.

### Measuring whether standing changes anything

The claim this format rests on — that machine-readable standing changes what a
reader does — is checkable, so a control-arm benchmark lives under
`packages/strauss-kb/bench/`. Four arms answer the same questions over one
synthesized base: standing and supersession links intact; standing stripped but
replaced with a "some of this is stale" instruction; standing stripped with no
instruction; and standing kept with the supersession links removed. Scoring is a
code rubric over a forced tool call, and the headline is the paired difference
between the full arm and each ablation. It is **dev-only**: `pnpm bench`, never
imported from `src/`, not in the published `files` list.

**A score threshold is not the growth path.** The wrong `audit trail` hit scored
0.318 against the correct `race condition` hit at 0.295, so any cut that drops
the first drops the second; a threshold excludes only the absurd, which is why
the vector tier is off by default.

### Tags are not the growth path

The `tags` field is written and can be
[selected on](./specification.md#frontmatter), but nothing validates it.
Free-text tags drift the way `auth` / `authentication` / `authn` drift, and
enforcing a vocabulary would make them a closed enum, which `type` already is.
The labels that matter are already verifiable: `strauss_anchors` names a file
and a symbol, which either match the repository or do not.

## Cost

Every consumer has a ceiling, and one rule when it is hit: **degrade toward
human, never toward auto** — drop to a note a reviewer reads, never to a pass
nobody asked for.

| Consumer          | Budget                           |
| ----------------- | -------------------------------- |
| Gate `Stop`       | ≤ 2 s, and no LLM call           |
| Gate `--report`   | ≤ 10 s                           |
| Merge policy      | ≤ 60 s                           |
| Walkthrough       | ≤ 30 s                           |
| Anchor resolution | linear in the files a PR touches |

`pnpm bench` runs the package's benches (`src/**/*.bench.ts`). Means on an
M-series laptop, Node 24, 2026-09-05; the ceiling is what `src/perf.spec.ts`
fails on, and a dash is a number the bench reports and nothing gates:

| Call                                       | Mean            | Ceiling |
| ------------------------------------------ | --------------- | ------- |
| `matchToDiff`, 1k records × 100 hunks      | 7.4 ms          | 300 ms  |
| `match` command, same shape                | 51 ms           | —       |
| `classifyDiff`, 5k files, 200 overrides    | 138 ms          | 1500 ms |
| `classify` command, 340 files, cold / warm | 13.7 / 5.2 ms   | —       |
| regex resolver, 5k-line file               | 0.3 ms (2.9 ms) | —       |
| tree-sitter resolver, 5k-line TypeScript   | 23 ms           | —       |
| log reader, 100k entries                   | 153 ms          | 1500 ms |
| `stamp`, companion fixture base            | 0.7 ms          | 250 ms  |

Cold / warm is the banner cache; the resolver's second figure is the same file
with no braces, where a candidate walks to the end of it.

## Rejected: a format that needs a parser

This was broken twice: a hand-rolled frontmatter reader could not express nested
maps, so it misread every OKF `generated`, `sources[]`, and `verified[]`, and
its replacement's first log format was `·`-delimited. Both are gone — the log is
JSONL and the schema is emitted from Zod, so `strauss-kb schema` **is** the
contract.

## Rejected for now: a base registry

Cross-base questions are unaskable by construction — supersession, traces, and
search stop at the directory boundary — which is the price of a base that can be
copied or handed over whole. The cheap escape, if cross-base ever becomes the
common case, is a registry: a list of paths a caller may name explicitly,
queried one at a time and merged only for display.

## Why the MCP server is standalone

A base is self-contained: a directory of markdown that needs no database and no
running service to read. Folding these tools into a larger server would make
every consumer start it to open files it could open itself, so `strauss-kb-mcp`
speaks stdio, takes no API key and no required environment, and writes
diagnostics to stderr.

The optional search backend is used as a **library**, never through its own MCP
server: that would let a caller reach a base without going through the store.
