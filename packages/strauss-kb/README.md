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

`verified` is the record's append-only trail of checks. Each entry is OKF's
actor stamp — `{ by, at }` — and the entries this package's `verify` writes add
a `note`: what the check actually found, not just that one happened. The `note`
is a strauss extension key on the entries this tool writes, not an OKF
requirement on the array, so noteless entries a foreign producer wrote remain
readable, and prior entries are spread forward untouched rather than reshaped.

Who may append is the point. A verifier whose actor equals the record's
`generated.by` — compared case-insensitively over the whole actor, so case
drift cannot mint a distinct verifier identity — is refused unless the actor
is `human:`-prefixed: trust that can be self-granted is not trust, and a
generator re-reading its own output is not an independent check. The refusal
is recorded in the log as `verify:refused`, so an audit sees the attempt as
well as the rule. The `human:` prefix itself is an honor-system label — actor
identity is self-declared through `STRAUSS_KB_ACTOR`, not an authenticated
identity claim — which is worth knowing when deciding how much weight a
human-verified event carries.

Anything prefixed `strauss_` is this package's extension, namespaced so a later
OKF version defining the same name cannot collide:

| Key                                                            | Meaning                                                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strauss_status`                                               | `draft`, `proposed`, `accepted`, `open`, `resolved`, `rejected`, `superseded`. Parses with a default of `draft`.                                                                              |
| `strauss_supersedes` / `strauss_superseded_by`                 | Both directions of a supersession, written together.                                                                                                                                          |
| `strauss_anchors`                                              | `{ file, symbol?, hash?, lines?, resolved_at? }` — where the record attaches in the code, and optionally what that code looked like when it did. See [Anchors and drift](#anchors-and-drift). |
| `strauss_assumption`                                           | The claim has no source, said as a field rather than as a fake entry in `sources`.                                                                                                            |
| `strauss_answered`                                             | Who resolved an open question, and when.                                                                                                                                                      |
| `strauss_verify`                                               | Checks that would confirm the record still holds.                                                                                                                                             |
| `strauss_materiality` / `strauss_confidence` / `strauss_owner` | `blocking`/`important`/`non-blocking`, `low`/`medium`/`high`, and a name.                                                                                                                     |

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
`validate` drops to catching hand-edits. A `write` (or `write-decision`) that
carries `supersedes` does the same: the new record publishes first, then each
prior record it names is marked superseded in turn — a crash between the two
leaves an old record with no backlink, which `validate` already reports as
"is not marked superseded", never a silent drift. A `supersedes` id naming a
record that does not exist yet is legal and does not fail the write; `validate`
is what reports a target that never resolves. A `supersedes` id naming the
record's own concept id is a no-op rather than an error, duplicate ids mark
once, and the array is capped at 32 entries.

A concurrent writer marking the same target races the compare-and-swap check;
that's retried a few times before giving up, and giving up is reported the
same way as a target that doesn't exist yet — left out of `supersededIds` for
`validate` to catch, not thrown, since the calling record is already
published by that point. If two different records both name the same target
in `supersedes`, the target's backlink points at whichever wrote last;
`validate` doesn't see this as a problem because the target genuinely is
superseded, but `kb_query`/`kb_load`'s adjudication surfaces the resulting
fork as a warning at read time.

`kb_write` and `kb_write_decision` return
`{ conceptId, action: "created" | "superseded-prior", supersededIds }` —
`supersededIds` is only the ids actually marked, not every id the input named.
A 409 from a concept-id collision carries `action: "refused"` in its `details`,
alongside the `conceptId`.

Records are never deleted. Superseding keeps the earlier reasoning inspectable,
which is what a later `trace` reads.

`no-decision` records the explicit claim that a piece of work had nothing to
decide (an idempotent `decision.none` record). It exists for workflow gates:
"did you write a decision?" rewards writing a junk one, "did you answer?"
does not — so silence has to be expressible.

## Anchors and drift

An anchor names where a record attaches in the code: a file, and optionally a
symbol within it. Symbolic, because a line number written mid-change is wrong
by the end of it. Three further fields extend an anchor with a baseline of what
that code looked like:

| Field         | Meaning                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hash`        | `sha256:<64 hex chars>` over the anchored text. Prefixed with the algorithm, so a future one can coexist with stored values.                                      |
| `lines`       | Line count of the text the hash was taken over. The anchor keeps a hash, not the text — without the count, a drift report could say "changed" but never how much. |
| `resolved_at` | When the anchor last resolved successfully.                                                                                                                       |

All three are optional, so every existing anchor stays valid — and an anchor
nobody has stamped costs nothing at read time, because drift detection skips
hashless anchors outright.

`anchor-resolve <concept-id>` (`kb_anchor_resolve`) is the mechanical
counterpart to `verify`: where `verify` records that someone attested to the
record, `anchor-resolve` checks whether the code the record anchors to is still
what it was. It resolves each anchor against the working tree — `--repo-root`
when the code is not under the current directory — and reports one of four
states per anchor:

- **stamped** — the anchor had no hash; the current code's hash, line count,
  and timestamp are written onto it. This is the write path for hashes:
  `write` callers record symbols, not digests, and the first resolve backfills
  the baseline once the code settles.
- **match** — the code still hashes to the stored value. `resolved_at` is
  refreshed.
- **drifted** — the code moved out from under the stored hash. The result
  carries both hashes and `diffSize`, the absolute line-count change (`null`
  when the anchor recorded no `lines` — size unknown, not zero). The stored
  baseline is kept, unless `--rebaseline` accepts the current code as the new
  one.
- **unresolved** — the file is missing, the symbol not found, or the anchor's
  path points outside the repository root (`outside-repo`). A finding, not
  an error: drift detection runs over bases whose code has moved, and moved
  code is exactly what it exists to report. The outside-repo case is a
  containment rule, not a convenience: bundles are data, and an anchor must
  not be able to read files beyond the repo it describes.

The CLI exits non-zero when any anchor drifted, so a CI gate can run it bare.
On a `--frozen` base the report still runs — drift reporting is a read; only a
stamp, refresh, or rebaseline is refused.

A fully clean run — at least one match, nothing drifted or unresolved — appends
a `verified[]` event (`anchor-resolve: N/N anchors match`), because code still
hashing to what it did when the record was written is real evidence the record
still holds. The same verifier-identity rule as `verify` applies: a resolve run
by the record's own generator reports `verifyRefused: "self-verification"`
instead of verifying. The drift report stands either way; only the stamp is
refused.

Resolution is a v1 heuristic: a regex resolver matches the symbol's last dotted
segment (`KbStore.setStatus` matches on `setStatus`) against declaration-shaped
lines and captures the block by brace counting — deterministic, blind to
strings and comments, good enough until a real parser takes the seat. It sits
behind an `AnchorResolver` interface — source string in, range out, pure — so a
tree-sitter or codegraph resolver later slots in without touching the drift
machinery. An anchor with no symbol is about the whole file and hashes all of
it, and line endings are normalised before hashing so checkout style cannot
read as drift.

Drift also surfaces where records are read: `kb_load` and `kb_query` re-check
every hash-carrying anchor of the records they return and attach a
`{ kind: "drifted", anchors: [...] }` warning when the code moved — the record
may describe code that no longer exists in that form. This is an enrichment: a
filesystem failure degrades to no drift reported rather than failing the read.
A future `kb_doctor` will list every drifted anchor base-wide from the same
warning.

## CLI

```
strauss-kb [--bundle PATH] <command> [args]

  write <type> < record.json               Write one record.
  write-decision < decision.json           Write a decision, with the rejected alternative as a field.
  no-decision <reason...>                  Claim in one sentence that there was nothing to decide.
  status <concept-id> <status>             Move a record's status, compare-and-swap.
  supersede <concept-id> <replacement-id>  Mark a record superseded, linking both directions.
  answer <concept-id> <answer...>          Resolve an open question and append the answer.
  verify <concept-id> --note <text>        Append a verified[] event — who checked, when, and what the check found.
  anchor-resolve <concept-id> [--repo-root <path>] [--rebaseline]
                                           Resolve anchors against the working tree: stamp, refresh, or report drift.
  load [type] [--budget N | --all]         Hand over the whole base, each record with its standing.
  pack <conceptId> [--hops N] [--max-nodes N] [--budget N]
                                           The bounded neighbourhood around one record, every cut named.
  query <text...>                          Search; every match arrives flagged with its standing.
  trace <concept-id> [edges...]            How a position was arrived at, as a timeline.
  list [type]                              Every record, optionally narrowed to one type.
  index                                    The index, rebuilt if it disagrees with the records.
  log                                      What touched what, and when.
  validate                                 Cross-record checks. Exits 1 when it reports a problem.
  schema                                   JSON Schema for the format.
  types                                    The twelve types, their sections and initial status.
  pin [bundle-path] [flags]                Pin a base. --mode, --profiles, --frozen; --local/--user pick the layer.
  unpin [bundle-path]                      Remove a base from every manifest layer that holds it.
  pins                                     Every pinned base, with whether it resolves to records.
  context [--profile NAME] [--budget N]    The pinned-base index block, for injection at context birth.
  sync-instructions <file>                 Plant the context block between sentinels in an instruction file.

  --bundle PATH  defaults to ./.strauss/kb
  STRAUSS_KB_ACTOR names the writer in the log
```

Results go to stdout as JSON — `index` and `pack` are markdown, which is what
they are. Errors
go to stderr and exit 1. `validate` and `anchor-resolve` are the commands whose
exit code is not just "did it run": a check that reports a problem succeeded as
a command and failed as a check, so each exits 1 with its findings on stdout.

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
`kb_status`, `kb_supersede`, `kb_answer`, `kb_verify`, `kb_anchor_resolve`,
`kb_load`, `kb_pack`, `kb_query`,
`kb_trace`, `kb_list`, `kb_index`, `kb_log`, `kb_validate`, `kb_schema`, `kb_types`,
`kb_pin`, `kb_unpin`, `kb_pins`, `kb_context`. Most tools take a `bundlePath`;
`kb_schema` and `kb_types` describe the format rather than any one base, and
`kb_pins` and `kb_context` read the workspace pin manifests instead. The one
CLI verb with no tool is `sync-instructions` — file plumbing for hooks, not an
agent capability; the capability is `kb_context`.

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
  hit.warnings; // rejected, broken-chain, forked-chain, stale, unverified, drifted…
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

Freshness is tiered by who did the confirming. OKF's spec (§5.3) defines the
trust tiers from the verifying actor's prefix: an empty `verified[]` is
unverified, an agent-prefixed verifier makes the record machine-confirmed, and
a `human:`-prefixed verifier makes it human-reviewed. Of that ladder, today's
adjudication reports only the first rung — the warning it attaches when
`verified[]` is empty; reporting the full tier is upcoming tooling. When it
lands, the tier will be derived from the events at read time, never stored, so
it cannot drift from the trail that justifies it.

**Load before you search.** These bases run to a few thousand tokens — twenty
records measured at about 3,000 — so the first thing to try is taking all of it.
On nine questions whose wording appears in no record, a reader holding the whole
base answered eight; embedding search over the same records answered four. Two
of those differences are structural rather than matters of degree: a reader can
say no record answers the question, where vector search returns its nearest
neighbour whatever the distance; and a reader picks the record that answers the
question rather than the one nearest the topic. The mechanism is simple:
retrieval makes similarity the gatekeeper, and a match the ranker misses never
reaches the model. A full read lets the model do the matching itself —
synonymy, implication across records, aggregation — which no ranker does.

Read for a question, not for a session: a base loaded at the start of a long
conversation is summarised away by the end of it, and reloading costs about
three thousand tokens. Read it again at the point of use.

`load` refuses rather than truncating when a base exceeds its budget (25,000
tokens by default). A truncated base is indistinguishable from a complete one,
so a caller would answer "that was never decided" from a slice it did not know
was a slice. `context` refuses the same way at its own, tighter budget (4,000
by default). Superseded records come back as name, replacement and date only —
their bodies no longer hold, and a body read later in a long session outlives
the qualifier that said so. `trace` still reaches them by id.

`--all` (`all: true` over MCP) is the escape hatch: it bypasses the refusal
outright and hands back the entire bundle whatever its size. A loaded result
carries `tokensLoaded`, the same estimate the budget is held against, and
`budgetTokens: null` marks that no ceiling was applied; `--all` is mutually
exclusive with `--budget`. That refusal is the guardrail an agent needs so a
wide base does not silently consume its whole context; `--all` is for a
deliberate operator who has decided the size is worth the tokens, not a
setting to reach for by default. A reader that does not actually need every
record is better served by a narrower `type` filter or a `query` than by
turning the guardrail off.

**Pack is the middle rung.** Under budget, load the base whole — perfect
recall beats any ranking. Over budget, when the work centres on a record you
can name, `pack` hands over that record's bounded neighbourhood instead:
everything within `--hops` of the root, walked over the base's edges — body
links (a `relatedConceptIds` entry is stored as one), supersession in both
directions, shared code anchors, and shared sources — ranked and cut to
`--max-nodes`. Standing travels with it: superseded neighbours arrive as the
same name, replacement and date stubs `load` emits. Every record the cut
dropped is named under Excluded, because a named gap is knowable and a silent
one is not, and past its own token budget `pack` refuses exactly as `load`
does — naming what was already cut, so the caller can narrow the walk or
raise the ceiling. Below the header, the only place a timestamp appears, the
output is byte-identical across runs over an unchanged base: two packs diff,
and a changed byte means changed knowledge. With neither a budget problem nor
a root record in hand, the question is a point lookup, and that is `query`.

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

Long sessions lose a knowledge base twice over: attention decays, and
compaction summarises away both the records loaded early and the instruction
that said to consult them. The fix is two-tier: a small index is re-injected
at every context birth, and record bodies are fetched by tool when a question
actually needs them.

```bash
strauss-kb pin docs/kb                   # mark a base every session should see
strauss-kb context                       # emit the pinned index block
strauss-kb sync-instructions AGENTS.md   # or keep it in an instruction file
```

Pins live in `.strauss/kb-pins.json`, committed with the repo. Two more
layers exist: `.strauss/kb-pins.local.json` (personal, gitignore it) and
`~/.strauss/kb-pins.json` (every workspace). Nearest layer wins per base,
`--local`/`--user` write the other layers, and `unpin` removes from all
three. A malformed layer is skipped on read and refused on write.

Per pin:

- `--mode full` — inject the records themselves, not just the index. For
  small or critical bases (ADRs). Falls back to a labelled index when it
  cannot fit the block budget.
- `--mode index` — never inject bodies.
- `--profiles a,b` — only inject in the named profiles.
- `--frozen` — the base is concluded; write commands refuse until `--unfreeze`.

Budgets are named profiles — `session-start`, `compact`, `turn` — with
per-repo overrides in the manifest, so hook commands never carry numbers:

```json
{
  "pins": [{ "path": "docs/adr", "mode": "full" }],
  "context": { "compact": { "budgetTokens": 1500 } }
}
```

Flags beat the manifest, the manifest beats the built-ins, and invalid values
fall back to defaults instead of silencing the index. Past its budget,
`context` refuses like `load` does — never truncates — and its refusal says
what to load directly and how to shrink the block.

`sync-instructions <file>` keeps the same block between
`<!-- strauss-kb:begin/end -->` sentinels in AGENTS.md or CLAUDE.md, touching
nothing outside them. Re-run it when pins change; it is idempotent. This is
the mechanism for runtimes without a reliable post-compaction hook, since
instruction files are re-read where conversation history is not.

What each runtime gets (configs in the
[plugin's adapters](../../plugins/strauss-kb/adapters/)):

| Layer                     | Claude Code        | Codex CLI                                   | Antigravity CLI            |
| ------------------------- | ------------------ | ------------------------------------------- | -------------------------- |
| MCP tool descriptions     | ✓                  | ✓                                           | ✓                          |
| Session-start injection   | SessionStart hook  | SessionStart hook                           | PreInvocation, per turn    |
| Post-compact re-injection | ✓ `compact` source | ✓ client-side; instruction-only when hosted | moot — injected every turn |
| File-read blocking        | opt-in PreToolUse  | ✗ (shell is the side door)                  | opt-in PreToolUse, JSON    |
| Instruction file          | CLAUDE.md          | AGENTS.md                                   | AGENTS.md + rules/         |

One more thing agents add: file tools. A raw read of a record file bypasses
standing entirely — a superseded record reads exactly like a current one — so
bases are read through the tools, and a workspace can enforce that with deny
rules or the plugin's opt-in PreToolUse script:

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
