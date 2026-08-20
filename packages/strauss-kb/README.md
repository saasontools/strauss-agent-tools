# @saasontools/strauss-kb

A knowledge base is a directory of small markdown records. Copy the directory
and you have the whole thing — nothing outside it is needed to read, search,
adjudicate, or trace it.

This package is that directory's library, its command line, and its MCP server.
All three project one command table, so a capability exists in every surface or
in none.

The point of the format is **standing**, not storage. A search engine answers
"does this match?"; a knowledge base also has to answer "is this still what we
hold?" — and the two disagree in a predictable direction, because a superseded
record is usually the older, longer, more general one and its replacement is
usually a narrowing. Every result therefore arrives flagged rather than
filtered.

## Install

```bash
npm install -g @saasontools/strauss-kb
```

Global install is the supported path. The consumers of the CLI are agent skills
that shell out to `strauss-kb` by name, many times per session and from whatever
directory the work happens to be in — so the binary has to be on `PATH` without
a per-project setup step, and per-call resolution latency is paid on every call.
The trade-off accepted is that the version is machine-wide and not pinned by the
consuming project; the on-disk format is the compatibility contract, and the
reader is deliberately tolerant of records it did not write (unknown frontmatter
keys are preserved, a missing status defaults).

Two alternatives work and are not the documented convention:

|                | Command                                                           | When it fits                                                                                                                                    |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Per invocation | `npx -y @saasontools/strauss-kb@0.1`                              | Pinned and zero-install; adds resolution latency to every call and needs a warm npx cache or a network.                                         |
| Project-local  | `pnpm add -D @saasontools/strauss-kb` then `pnpm exec strauss-kb` | Pinned per repository and offline after install; bare `strauss-kb` does not resolve outside that repository, so skills cannot use one spelling. |

As a library:

```bash
npm install @saasontools/strauss-kb
```

Ships ESM and CommonJS. A consumer that transpiles per-file to CommonJS without
bundling can `require()` it without depending on its Node version honouring
`require(esm)`.

## What is in a base

```
<kb>/
  <type>.<slug>.md    records
  INDEX.md            index      derived, store-owned
  log.jsonl           history    primary, append-only
  .index.sqlite       search     derived, gitignored
```

The default base is `.strauss/kb` relative to the working directory;
`--bundle PATH` addresses any other. A scratch base under a worktree and a
committed base versioned beside the code it describes are the same format with
different lifetimes. Nothing promotes one to the other.

`INDEX.md` and `log.jsonl` are store-owned and differ in kind — treating them
alike is how the history gets lost:

|         | `INDEX.md`                                 | `log.jsonl`                                 |
| ------- | ------------------------------------------ | ------------------------------------------- |
| Nature  | derived — recomputable from frontmatter    | primary — records events nothing else holds |
| Write   | full regenerate                            | append                                      |
| Repair  | rebuilt when it disagrees with the records | malformed lines reported, never rewritten   |
| If lost | reconstructed free                         | gone                                        |

Repair-on-read, not coordination, is what lets both exist without a lock. The
index is _eventually_ correct: a writer whose scan predated another's record
publishes a briefly stale index, and the next read through the store settles it.

## Records

The filename is the identity. `fact.auth-retries.md` has concept id
`fact.auth-retries` — `<type>.<slug>`, both halves kebab-case. One record per
file, so parallel writers never merge; they only choose distinct names.

Records are [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog)
concepts. `type` is the only key OKF requires; `title`, `description`,
`resource`, `tags`, `sources`, `generated`, `verified`, and `stale_after` are
OKF's. Unknown keys are preserved rather than stripped, as OKF requires of
consumers.

Anything prefixed `strauss_` is this package's extension, namespaced so a later
OKF version defining the same name cannot collide:

| Key                                                            | Meaning                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `strauss_status`                                               | `draft`, `proposed`, `accepted`, `open`, `resolved`, `rejected`, `superseded`. Parses with a default of `draft`.                           |
| `strauss_supersedes` / `strauss_superseded_by`                 | Both directions of a supersession, written together.                                                                                       |
| `strauss_anchors`                                              | `{ file, symbol? }` — where the record attaches in the code. Symbolic, because a line number written mid-change is wrong by the end of it. |
| `strauss_assumption`                                           | The claim has no source, said as a field rather than as a fake entry in `sources`.                                                         |
| `strauss_answered`                                             | Who resolved an open question, and when.                                                                                                   |
| `strauss_verify`                                               | Checks that would confirm the record still holds.                                                                                          |
| `strauss_materiality` / `strauss_confidence` / `strauss_owner` | `blocking`/`important`/`non-blocking`, `low`/`medium`/`high`, and a name.                                                                  |

Edges are markdown links in the body, as OKF specifies — untyped, with the kind
conveyed by the surrounding prose. Broken links are legal: records are routinely
written before the ones they point at exist.

Twelve record types differ only in what their body answers and where they start
in the lifecycle — `fact`, `requirement`, `constraint`, `decision`,
`assumption`, `open-question`, `risk`, `contract`, `flow`, `affected-system`,
`test-obligation`, `source-note`. `strauss-kb types` prints each one's purpose,
body sections, and initial status; a section a type does not define is rejected
rather than written.

Do not work from memory on the frontmatter contract — `strauss-kb schema` emits
JSON Schema generated from the code that enforces it, so it cannot drift from
what a write will accept.

```yaml
---
type: decision
title: Compare-and-swap rather than a lock
description: A stale lock hold blocks every later writer.
generated: { by: agent, at: 2026-08-16T09:14:00Z }
verified: []
strauss_status: accepted
strauss_anchors:
  - { file: src/kb-store.ts, symbol: KbStore.setStatus }
---

## Decision

Read-modify-write checks a content digest immediately before publishing.

## Rejected

A lock file. It closes the window and adds a stale-hold failure mode that is
worse than the residue.
```

## Writes

Records are staged to a sibling file and published atomically, so a concurrent
reader sees a whole record or none. Publication uses `link`, which fails when
the name is taken — two writers choosing one concept id is a 409 the caller must
answer, by picking a more specific slug or by saying it meant to replace.
`rename` is used only when the caller passes `overwrite`.

Read-modify-write (`setStatus`, `answer`) checks a content digest immediately
before publishing, which narrows the lost-update window rather than closing it.
[ARCHITECTURE.md](./ARCHITECTURE.md) says why a lock was rejected.

`supersede` writes both directions, so a backlink cannot drift in normal use and
`validate` drops to catching hand-edits.

Records are never deleted. Superseding keeps the earlier reasoning inspectable,
which is what a later `trace` reads.

## CLI

```
strauss-kb [--bundle PATH] <command> [args]

  write <type> < record.json               Write one record.
  write-decision < decision.json           Write a decision, with the rejected alternative as a field.
  no-decision <reason...>                  Claim in one sentence that there was nothing to decide.
  status <concept-id> <status>             Move a record's status, compare-and-swap.
  supersede <concept-id> <replacement-id>  Mark a record superseded, linking both directions.
  answer <concept-id> <answer...>          Resolve an open question and append the answer.
  load [type] [--budget N]                 Hand over the whole base, each record with its standing.
  query <text...>                          Search; every match arrives flagged with its standing.
  trace <concept-id> [edges...]            How a position was arrived at, as a timeline.
  list [type]                              Every record, optionally narrowed to one type.
  index                                    The index, rebuilt if it disagrees with the records.
  log                                      What touched what, and when.
  validate                                 Cross-record checks. Exits 1 when it reports a problem.
  schema                                   JSON Schema for the format.
  types                                    The twelve types, their sections and initial status.
  pin [bundle-path]                        Pin a base into the workspace manifest. Idempotent.
  unpin [bundle-path]                      Remove a base from the workspace manifest.
  pins                                     Every pinned base, with whether it resolves to records.
  context [--profile NAME] [--budget N]    The pinned-base index block, for injection at context birth.
  sync-instructions <file>                 Plant the context block between sentinels in an instruction file.

  --bundle PATH  defaults to ./.strauss/kb
  STRAUSS_KB_ACTOR names the writer in the log
```

Results go to stdout as JSON — `index` is markdown, which is what it is. Errors
go to stderr and exit 1. `validate` is the one command whose exit code is not
just "did it run": a check that reports a problem succeeded as a command and
failed as a check, so it exits 1 with its findings on stdout.

```bash
strauss-kb --bundle .strauss/kb write fact <<'JSON'
{
  "slug": "cache-key-includes-region",
  "title": "The cache key includes the region",
  "why": "A region-less key serves one region another region's data.",
  "sections": { "Claim": "Every key is prefixed with the region." },
  "anchors": [{ "file": "src/cache/order-cache.ts", "symbol": "OrderCache.get" }]
}
JSON

strauss-kb query cache key region
strauss-kb validate || echo "problems above"
```

## MCP server

`strauss-kb-mcp` speaks stdio and takes no API key and no required environment.
Every CLI verb is a tool: `kb_write`, `kb_write_decision`, `kb_no_decision`,
`kb_status`, `kb_supersede`, `kb_answer`, `kb_load`, `kb_query`, `kb_trace`,
`kb_list`, `kb_index`, `kb_log`, `kb_validate`, `kb_schema`, `kb_types`,
`kb_pin`, `kb_unpin`, `kb_pins`, `kb_context`. Most tools take a `bundlePath`;
`kb_schema` and `kb_types` describe the format rather than any one base, and
`kb_pins` and `kb_context` read the workspace pin manifest rather than any one
base — which bases a session should see is workspace state, not a property of
a base.

The one CLI verb with no tool is `sync-instructions`: it edits instruction
files for hooks and sentinel blocks, which is plumbing rather than an agent
capability — the capability, "get the pinned context block", is `kb_context`.
(`context`'s `--format`/`--event` flags are the same kind of thing: an envelope
for hook protocols that require strict JSON on stdout; MCP callers get the
identical block without them.)

```json
{
  "mcpServers": {
    "strauss-kb": { "command": "strauss-kb-mcp" }
  }
}
```

The tool descriptions carry the judgment a schema cannot: that an unsourced
claim is an `assumption` and not a `fact` with a vague source, that a conflict
between two records belongs in a `risk` or a superseding `decision` rather than
being quietly resolved, and that `kb_load` is usually the right first call.

`STRAUSS_KB_ACTOR` names the writer in the log. Diagnostics go to stderr,
because stdout is the JSON-RPC transport.

## Library

```ts
import { KbStore, composeRecord, matchToDiff } from "@saasontools/strauss-kb";

const store = new KbStore();
await store.write(
  ".strauss/kb",
  composeRecord("decision", input, "agent", new Date().toISOString()),
);

const hits = await store.query(".strauss/kb", "cache key");
for (const hit of hits) {
  hit.standing; // current | superseded | rejected | unsettled | open
  hit.heads; // where the supersession chain ends
  hit.warnings; // rejected, broken-chain, forked-chain, stale, unverified…
}
```

`matchToDiff` answers a different question from `query`: given a structural
description of a diff, which records are anchored to each hunk. It takes hunks
and optional symbol ranges rather than a patch, so this package carries no diff
parser, and it degrades to file-level precision — labelled as such — when a
symbol cannot be resolved.

## Retrieval

Three axes decide whether a record answers a question, and only one is a search
problem:

| Axis      | Source                                                  | Question                        |
| --------- | ------------------------------------------------------- | ------------------------------- |
| Relevance | BM25 where an index exists, substring where it does not | does this match?                |
| Standing  | `strauss_status`, the supersession chain                | is this still what we hold?     |
| Freshness | `stale_after`, `verified[]`                             | has anyone confirmed it lately? |

**Load before you search.** These bases run to a few thousand tokens — twenty
records measured at about 3,000 — so the first thing to try is taking all of it.
On nine questions whose wording appears in no record, a reader holding the whole
base answered eight; embedding search over the same records answered four. Two
of those differences are structural rather than matters of degree: a reader can
say no record answers the question, where vector search returns its nearest
neighbour whatever the distance; and a reader picks the record that answers the
question rather than the one nearest the topic.

The mechanism behind that margin: retrieval makes similarity the gatekeeper — a
match the ranker misses never reaches the model, so the reader's judgment is
applied only to what similarity already let through. A full read lets the model
do the semantic matching natively: synonymy the embedding space does not know,
implication across records that share no vocabulary, supersession, and
aggregation across many records. It is also why the vector tier stays off — a
better gatekeeper is still a gatekeeper.

Read for a question, not for a session: a base loaded at the start of a long
conversation is summarised away by the end of it, and reloading costs about
three thousand tokens. Read it again at the point of use.

`load` refuses rather than truncating when a base exceeds its budget (25,000
tokens by default). A truncated base is indistinguishable from a complete one,
so a caller would answer "that was never decided" from a slice it did not know
was a slice. `context` refuses the same way at its own, tighter budget (4,000
tokens by default): past it, the block degrades to a list of the pinned bases
and their sizes rather than to a partial index that reads as a whole one. Superseded records come back as name, replacement and date only —
their bodies no longer hold, and a body read later in a long session outlives
the qualifier that said so. `trace` still reaches them by id.

**Flag, never filter.** `query` returns every hit with its standing, because a
filtered result set is invisible — the caller cannot tell it missed anything.
The single exception is narrow: a superseded record is dropped only when its
replacement is also in the results, so the thread is never lost.

**Trace inverts the point query.** In a query a `rejected` record is the most
dangerous thing retrievable — a well-formed assertion of what someone decided
_not_ to do. In a history it is the content. `trace` follows supersession,
shared code anchors, and shared sources, and orders by `generated.at`; ranking a
history is meaningless when the sequence is the point.

Chain resolution happens on read. A stored head would need rewriting on every
ancestor whenever a chain grows, which is derived state that goes stale. The
walk follows both pointers, so a hand-edit that left one side behind cannot
return a record the base openly claims is replaced. A cycle terminates with
`chain-cycle`; a fork reports every head rather than presenting a guess as a
fact; a missing replacement is `broken-chain` with no head — the case that needs
the most care, because returning the stale record unmarked looks exactly like
success.

## Living in an agent session

A session loses a knowledge base in two ways. Attention decays over a long
context, and compaction summarises the conversation's history — including any
records loaded early, and including the early instruction that said to consult
the base at all. The instruction is itself history; nothing about it survives
by being important.

The pattern that holds up is two-tier, and worth naming: **the index survives,
load is re-invoked**. A small derived index sits at the top of context — free
to regenerate, cheap to re-inject at every context birth — and the record
bodies are fetched by tool at the point of use, question by question. Neither
tier tries to do the other's job: the index never carries bodies (a body read
early outlives the qualifier that said it no longer holds), and a load is never
expected to survive the session it was made in.

Four layers implement it, each covering the failure mode of the one above:

1. **Pin + context.** `pin` records in `.strauss/kb-pins.json` — committable,
   relative paths, workspace state that never touches the pinned base — which
   bases every session should see. `context` emits their index as one
   self-instructing markdown block: a stable heading (so re-injection after
   compaction reads as a refresh, not a contradiction), the routing to the
   tools, and the why. Injected at every context birth.
2. **The block's preamble** routes to `kb_load` / `kb_query` / `kb_trace` and
   says why file reads are wrong, so the index itself re-teaches the doctrine
   each time it appears.
3. **A PreToolUse script** (shipped in the [plugin](../../plugins/strauss-kb/),
   opt-in per workspace) blocks raw file access to pinned bases, with the
   redirect delivered at the exact point of violation. Opt-in because blocking
   reads on project paths is workspace policy, not something a plugin imposes —
   the plugin README shows the granular tiers, from per-base deny rules up.
4. **Tool descriptions** carry the point-of-use reload judgment. Descriptions
   are re-sent with every request, so they survive compaction when nothing
   else does.

One command, every injection point:

```bash
strauss-kb pin docs/kb            # once, committed with the repo
strauss-kb context                # the block, from wherever context is born
strauss-kb sync-instructions AGENTS.md   # sentinel block for instruction files
```

- **Instruction-file sentinel block** — `sync-instructions` idempotently owns a
  `<!-- strauss-kb:begin/end -->` region and touches nothing outside it.
  AGENTS.md is the canonical default (Codex and Antigravity both read it);
  CLAUDE.md is an alias of the same mechanism.
- **Runtime hooks** — Claude Code `SessionStart` (all four sources, including
  `compact`), Codex `SessionStart`, Antigravity `PreInvocation`. Runtimes whose
  hook protocol requires strict JSON on stdout get `--format json --event
NAME`; Claude Code and Codex take the plain block. Hooks ask for budgets by
  name — `--profile session-start` (full-under 1500), `--profile compact` and
  `--profile turn` (index-only, 2500) — and a repo overrides any of them in
  its pin manifest, so the numbers live with the pins rather than in hook
  commands:

  ```json
  {
    "pins": [{ "path": "docs/kb" }],
    "context": {
      "default": { "budgetTokens": 6000 },
      "compact": { "budgetTokens": 1500 }
    }
  }
  ```

  Explicit flags beat the manifest, the manifest's profile entry beats its
  `default`, which beats the built-ins. Invalid values are ignored — a typo'd
  budget must degrade to a default, never silence the index.

- **Harness-owned prompt assembly** — a harness that builds its own prompts
  calls `strauss-kb context` at assembly time like any other section.

What each runtime actually guarantees (details and configs in the
[plugin's adapters](../../plugins/strauss-kb/adapters/)):

| Layer                     | Claude Code        | Codex CLI                                                                | Antigravity CLI            |
| ------------------------- | ------------------ | ------------------------------------------------------------------------ | -------------------------- |
| MCP tool descriptions     | ✓                  | ✓                                                                        | ✓                          |
| Session-start injection   | SessionStart hook  | SessionStart hook                                                        | PreInvocation, per turn    |
| Post-compact re-injection | ✓ `compact` source | ✓ client-side; opaque server-side compaction covered by instruction only | moot — injected every turn |
| File-read blocking        | opt-in PreToolUse  | ✗ (shell is the side door)                                               | opt-in PreToolUse, JSON    |
| Instruction file          | CLAUDE.md          | AGENTS.md                                                                | AGENTS.md + rules/         |

Where a row says "instruction only", know what you are getting: after a
compaction there, nothing mechanically re-injects the index — the sentinel
block and the tool descriptions are what remind the model to reload.

**Why tool-only access for agents too.** "The store is the sole accessor" was
written about processes; agents with file tools reopen it. A raw file read is a
filtered view — no standing resolution, no chain walk — and the caller cannot
tell what it is missing, because a superseded or rejected record file reads
exactly like a current one. The opt-in PreToolUse script enforces this at the
tool layer; project-level deny rules are the most granular enforcement and
work with no script at all:

```json
{
  "permissions": {
    "deny": ["Read(.strauss/kb/**)", "Read(**/.strauss/kb/**)"]
  }
}
```

## Optional search tier

`@tobilu/qmd` is an **optional peer dependency** providing BM25 (`searchLex`,
no model download) over a `.index.sqlite` per base, rebuilt when a record is
newer than the index.

```bash
npm install -g @tobilu/qmd    # alongside a global strauss-kb
```

With it absent — the default — `query` falls back to a substring scan over
concept ids, titles, descriptions, and bodies. Nothing throws, no answer changes
shape, and only recall degrades. Measured against that fallback on a
twenty-record base, the lexical tier wins on word forms (`pages` finds a record
saying only `page`) and on little else: eight of nine probe queries returned
exactly what substring returned.

The vector tier is deliberately off. It does close the semantic gap — "why not
just use a mutex" finds a record about compare-and-swap that no lexical match
can — but its scores do not separate right from wrong. A wrong hit scored 0.318
against a correct one at 0.295, and any threshold that drops the first drops the
second. Scores are evidence for a reader to weigh, not a filter to apply before
one.

qmd is used as a library, never through its own MCP server: that would let a
caller reach a base without going through the store, and its default markdown
glob returns `INDEX.md` as a search hit.

## Constraints worth knowing

**The store is the sole accessor, not merely the sole writer.** Excluding
store-owned files from listings and repairing the index on read hold only while
everything goes through one door. Reading one record by a concept id you already
hold is the exception — no invariant, deterministic path.

**Cross-base questions are unaskable.** Supersession, traces, and search stop at
the directory boundary. "Was this settled somewhere else?" is answered by a
person choosing which base to open. That is the price of a base that can be
copied, deleted, or handed over whole, and it is what keeps the search index
disposable. [ARCHITECTURE.md](./ARCHITECTURE.md) covers the registry that would
lift it, and why it is unbuilt.

## License

MIT
