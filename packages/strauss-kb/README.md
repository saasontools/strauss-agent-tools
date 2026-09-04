# @saasontools/strauss-kb

A knowledge base is a directory of small markdown records: copy the directory
and you have the whole thing — nothing outside it is needed to read, search,
adjudicate, or trace it. This package is that directory's library, command line,
and MCP server; all three project one command table.

The point of the format is **standing**, not storage: not only "does this
match?" but "is this still what we hold?" Results are flagged, never filtered.

Reference:
[docs](https://saasontools.github.io/strauss-agent-tools/overview).

## Install

```bash
npm install -g @saasontools/strauss-kb
```

Global install is the supported path: agent skills shell out to `strauss-kb` by
name, from any directory.

Two alternatives work and are not the documented convention:

|                | Command                                                           | When it fits                                                                                                  |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Per invocation | `npx -y @saasontools/strauss-kb@0.1`                              | Pinned, zero-install; per-call latency, needs a warm cache or net.                                            |
| Project-local  | `pnpm add -D @saasontools/strauss-kb` then `pnpm exec strauss-kb` | Pinned per repository, offline; bare `strauss-kb` resolves only inside it, so skills cannot use one spelling. |

As a library:

```bash
npm install @saasontools/strauss-kb
```

ESM and CommonJS.

## What is in a base

```
<kb>/
  <type>.<slug>.md    records
  INDEX.md            index      derived, store-owned
  log.jsonl           history    primary, append-only
  .gitattributes      merge      store-owned, written on first write
  .index.sqlite       search     derived, gitignored
```

The default base is `.strauss/kb`; `--bundle PATH` names another.
`INDEX.md` and `log.jsonl` are store-owned and differ in kind:

|         | `INDEX.md`                 | `log.jsonl`                    |
| ------- | -------------------------- | ------------------------------ |
| Nature  | derived — from frontmatter | primary — events nothing holds |
| Write   | full regenerate            | append                         |
| Repair  | rebuilt when it disagrees  | malformed lines reported       |
| If lost | reconstructed free         | gone                           |

Repair-on-read, not coordination, lets both exist without a lock.

### Cross-worktree writes

A committed base is routinely written from more than one worktree at once —
each records into the same `log.jsonl`, and a plain git merge of two branches
that both appended lines resolves that file at the line level, same as any
other text file. That is the wrong merge for an append-only log: git's default
picks a side, or conflicts, on lines that both branches only ever meant to add
to.

So the first write to a base (through `write`, or whichever call happens to
append the first log line) declares a merge driver for its log: it writes
`log.jsonl text eol=lf merge=union` into the base's `.gitattributes` if that
file does not exist yet, and appends the line if the file exists but declares
no merge strategy for `log.jsonl` yet — a `.gitattributes` a user put there
first is respected, never overwritten wholesale, and a line that already
gives `log.jsonl` _any_ merge strategy — this one or the user's own choice
such as `merge=ours` — is left alone rather than layered under a second,
possibly conflicting one. `union` is one of git's built-in merge drivers; the
attribute alone is enough; nothing else needs configuring. `eol=lf` pins line
endings to `\n` regardless of a checkout's `core.autocrlf`, so a Windows
checkout normalizing the file on checkout can't leave it with mixed endings
against the raw `\n` every append writes. With it, a merge of two branches
that both appended to `log.jsonl` keeps both sides' lines instead of picking
one.

A union merge does not preserve line order, and can occasionally keep the
same line twice (a cherry-pick or rebase that carried one side's entry into
the other's history before the merge). `kb_log`'s reader (`kb-log.ts`) sorts
entries by `at` and drops exact duplicates before returning them, so neither
is something a caller has to account for.

**This applies to a local `git merge`, not to GitHub.** GitHub computes pull
request merges (and the merge/squash/rebase buttons) through its own service,
which does not read `.gitattributes` merge-driver declarations — a PR that
merges two branches' `log.jsonl` appends on GitHub gets git's ordinary
line-level merge (or a conflict) even with the attribute in place. The union
driver only fires for a merge actually run by a local git client, which covers
worktrees pulling from and pushing to each other directly, but not a merge
GitHub itself performs.

## Records

The filename is the identity: `fact.auth-retries.md` has concept id
`fact.auth-retries` — `<type>.<slug>`, both halves kebab-case.

Records are [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog)
concepts. `type` is the only key OKF requires; `title`, `description`,
`resource`, `tags`, `sources`, `generated`, `verified`, and `stale_after` are
OKF's. Unknown keys are preserved rather than stripped.

`verified` is an append-only trail of checks, each an actor stamp `{ by, at }`
plus a `note`. A verifier whose actor equals the record's `generated.by` is
refused unless the actor is `human:`-prefixed, and the refusal is logged as
`verify:refused`; the prefix is honor-system, since actor identity is
self-declared through `STRAUSS_KB_ACTOR`.

Anything prefixed `strauss_` is this package's extension, namespaced against a
later OKF key of the same name:

| Key                                                            | Meaning                                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strauss_status`                                               | `draft`, `proposed`, `accepted`, `open`, `resolved`, `rejected`, `superseded`. Default `draft`.                                                                 |
| `strauss_supersedes` / `strauss_superseded_by`                 | Both directions of a supersession, written together.                                                                                                            |
| `strauss_anchors`                                              | `{ file, symbol?, hash?, lines?, resolved_at? }` — where the record attaches, and what that code looked like then. See [Anchors and drift](#anchors-and-drift). |
| `strauss_links`                                                | `{ target, rel }` — a typed causal edge, source → target. See [Links](#links).                                                                                  |
| `strauss_assumption`                                           | The claim has no source, as a field rather than a fake entry in `sources`.                                                                                      |
| `strauss_answered`                                             | Who resolved an open question, and when.                                                                                                                        |
| `strauss_verify`                                               | Checks that would confirm the record still holds.                                                                                                               |
| `strauss_materiality` / `strauss_confidence` / `strauss_owner` | `blocking`/`important`/`non-blocking`, `low`/`medium`/`high`, and a name.                                                                                       |

Twelve types differ in what their body answers and where they start in the
lifecycle: `fact`, `requirement`, `constraint`, `decision`, `assumption`,
`open-question`, `risk`, `contract`, `flow`, `affected-system`,
`test-obligation`, `source-note`.

`strauss-kb types` prints each one's purpose, sections, and initial status;
`strauss-kb schema` emits JSON Schema from the code that enforces it.
Body sections, edges, and the frontmatter contract:
[specification](https://saasontools.github.io/strauss-agent-tools/specification).

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

## Links

`strauss_links` is a typed causal edge, `[{ target, rel }]` on the source
record, read source → target: `A depends_on B` means A needs B. The vocabulary
is closed: eight rels. The **dependant** — the end that breaks when the other
changes — is per-rel.

| `rel`         | `A <rel> B` means            | Dependant |
| ------------- | ---------------------------- | --------- |
| `depends_on`  | A needs B to hold            | A         |
| `verified_by` | B confirms A                 | A         |
| `satisfies`   | A discharges B's requirement | A         |
| `constrains`  | A bounds what B may do       | B         |
| `informs`     | A shaped B, not binding      | B         |
| `blocks`      | B waits on A                 | B         |
| `invalidates` | A makes B no longer hold     | B         |
| `related_to`  | no dependence                | —         |

`kb_impact` (`strauss-kb impact <id>`): the transitive set of dependants, each
rel followed in its own direction, never `related_to`.

`kb_backlinks` (`strauss-kb backlinks <id>`): every inbound edge, one hop, any rel.

`kb_validate`: unknown rel or malformed target is an `error`, absent target a
`warning`. Only errors fail the exit code.

The [specification](https://saasontools.github.io/strauss-agent-tools/specification)
has the rest.

## Writes

Records are staged to a sibling file and published atomically: a reader sees a
whole record or none. A concept-id collision is a 409 the caller answers with a
narrower slug or by saying it meant to replace. `supersede` writes both
directions of the link, and `write`/`write-decision` do the same for every id in
`supersedes`. Records are never deleted; superseding keeps earlier reasoning
inspectable for `trace`.

Crash, race, and fork edge cases:
[specification](https://saasontools.github.io/strauss-agent-tools/specification).
Why a lock was rejected: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Anchors and drift

An anchor names where a record attaches in the code: a `file`, optionally a
`symbol` — symbolic, because a line number written mid-change is wrong by the
end of it. Six optional fields extend it:

| Field         | Meaning                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| `hash`        | `sha256:<hex>` over the anchored text, algorithm-prefixed.                            |
| `hash_kind`   | What `hash` covered: `raw` text, or the `ast` token stream. Absent means `raw`.       |
| `lines`       | Line count the hash covered.                                                          |
| `resolved_at` | When the anchor last resolved.                                                        |
| `resolver`    | Which resolver produced the hash: `tree-sitter` or `regex`.                           |
| `repo`        | Which repository — remote URL or short name. Absent means this base's own repository. |
| `ref`         | Git rev the evidence was taken at.                                                    |

`hash`, `hash_kind`, `lines`, `resolved_at`, and `resolver` are **measured** — a resolution pass stamps
them; `repo` and `ref` are **author-owned identity** and a resolution pass
never writes them.

`anchor-resolve <concept-id>` (`kb_anchor_resolve`) is `verify`'s mechanical
counterpart: it checks the anchored code against the working tree
(`--repo-root` when the base is not inside it). Per anchor:

- **stamped** — no hash yet; hash, line count, and timestamp are written.
- **match** — unchanged; nothing written. `--restamp` re-dates on purpose.
- **drifted** — hash changed. Baseline kept unless `--rebaseline`.
- **unresolved** — not comparable, with a reason. A finding, not an error.

An anchor naming another `repo` is read from that repository's **remote**,
through a bare cache under `~/.strauss/repo-cache` — a local checkout is one
person's possibly stale view of the same file. With a `ref` it has three
states: `matches-ref`, `drifted-from-ref`, and `drifted-on-default`.
`--offline` reads the cache and never fetches. Only `https`, `ssh`, and `git`
remotes are fetched, and a `repo` or `ref` git could read as an option is a
finding, not a command.

An anchor must not read outside the repository it describes, checked lexically
and again on the real path after symlinks.

Exit code is non-zero on **drifted**, or on **unresolved** for an anchor that
carries a hash; unstamped anchors and unreachable remotes never fail.

A fully clean run — every anchor checked and `match`, none stamped this run —
appends a `verified[]` event.

Symbols resolve tree-sitter first — the 20 language packs that have both a
grammar and a definitions query, pinned together by `pnpm grammars pin` from
`grammars/packs.json` and proved at pin time — then the regex heuristic for
other extensions, then a
whole-file hash when the anchor names no symbol; an ambiguous or undefined symbol returns
`unresolved` rather than a guess. Grammars are not published with the package:
each downloads on first use, sha256-pinned against `grammars/manifest.json`,
and is cached under `~/.strauss/grammars`. A hash the old resolver still reproduces and
the new one does not is `drifted` with reason `resolver-changed` — accept it
with `--rebaseline`.

A tree-sitter stamp hashes the span's normalised token stream
(`hash_kind: "ast"`), so reformatting the anchored code is not drift. An anchor
stamped before that keeps comparing raw text until `--rebaseline` restamps it.

### Drift classes

Once the bytes differ, drift is classified — two classes a machine can close,
two it hands on:

- **moved** — the stored hash turned up elsewhere: same code, new address.
  `kb_reassess` moves the anchor and asks nothing of a reader.
- **cosmetic** — the old and new spans are one token stream; only formatting
  changed. Needs a grammar, so the regex resolver never reports it.
- **gone** — the file or the symbol no longer exists. The strongest signal:
  the described code cannot be re-read.
- **changed** — everything else, and the only class a reader has to judge.

`kb_reassess <concept-id>` (`kb_doctor --drifted` base-wide) turns what is left
into a packet: the record's claim, each anchor's class, the old-vs-new span diff
(`--with-diff`, recovered from `ref` or from history), and the record's `impact`
set. Neither verb verifies, supersedes, or changes standing — see the skill's
protocol.

Drift also surfaces on read: `kb_load` and `kb_query` attach a
`{ kind: "drifted" }` warning — or `{ kind: "unchecked" }` for a foreign anchor
they could not read from the cache, because they never fetch — and `kb_doctor`
lists both base-wide, per repository. All three take `--repo-root`. With no
`--repo-root` given, a run that finds not one anchored file drops the finding as
a wrong root; an explicit `--repo-root` is taken at its word.

Remote resolution in full:
[specification](https://saasontools.github.io/strauss-agent-tools/specification#anchors-in-another-repository).

Details: [specification](https://saasontools.github.io/strauss-agent-tools/specification).

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
  anchor-resolve <concept-id> [--repo-root <path>] [--rebaseline] [--restamp]
                                           Resolve anchors against the working tree: stamp, or report drift.
  reassess <concept-id> [--repo-root <path>] [--with-diff]
                                           One drifted record as something to judge: claim, classes, diff, impact.
  load [type] [--budget N | --all] [--repo-root PATH]
                                           Hand over the whole base, each record with its standing.
  catalog [type]                           Every record in one line — id, type, title, standing, stale flag.
  pack <conceptId> [--hops N] [--max-nodes N] [--budget N]
                                           The bounded neighbourhood around one record, every cut named.
  query <text...> [--repo-root PATH]       Search; every match arrives flagged with its standing.
  trace <concept-id> [edges...]            How a position was arrived at, as a timeline.
  impact <concept-id> [--depth N] [--rels a,b]
                                           What breaks if this changes: its dependants, transitively.
  backlinks <concept-id>                   Who points at this record — one hop, every rel.
  list [type]                              Every record, optionally narrowed to one type.
  index                                    The index, rebuilt if it disagrees with the records.
  log                                      What touched what, and when.
  validate                                 Cross-record checks. Exits 1 when it reports a problem.
  doctor [--expiring-days N] [--unverified-days N] [--aging-days N] [--repo-root PATH] [--strict]
                                           Health sweep: what expired, went unconfirmed, aged, was orphaned, or drifted.
  schema                                   JSON Schema for the format.
  types                                    The twelve types, their sections and initial status.
  pin [bundle-path] [flags]                Pin a base. --mode, --profiles, --frozen; --local/--user pick the layer.
  unpin [bundle-path]                      Remove a base from every manifest layer that holds it.
  pins                                     Every pinned base, with whether it resolves to records.
  context [--profile NAME] [--budget N]    The pinned-base index block, for injection at context birth.
  sync-instructions <file>                 Plant the context block between sentinels in an instruction file.

  --bundle PATH  defaults to ./.strauss/kb
  --json         the machine shape, where a command prints a table
  --             everything after it is text, not flags
  STRAUSS_KB_ACTOR names the writer in the log
```

Results go to stdout as JSON; `index`, `catalog` and `pack` are markdown, and
`doctor` prints a table unless `--json`. `--json` is refused where a command has
one form; `--` ends flag parsing. Errors go to stderr with exit 1; `validate`,
`anchor-resolve` and `doctor --strict` exit 1 with findings on stdout; only
`validate` findings with `severity: "error"` do, so warnings alone exit 0. Per-command flags:
[cli-reference](https://saasontools.github.io/strauss-agent-tools/cli-reference).

A flag accepts either spelling — `--budget 4000` or `--budget=4000` — and a
flag given no value is an error rather than a silent fallback to the default,
so a trailing typo cannot look like success.

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
strauss-kb validate || echo "errors above"   # warnings alone still exit 0
```

## MCP server

`strauss-kb-mcp` speaks stdio and takes no API key and no required environment.

```json
{
  "mcpServers": {
    "strauss-kb": { "command": "strauss-kb-mcp" }
  }
}
```

Every CLI verb is a tool: `kb_write`, `kb_write_decision`, `kb_no_decision`,
`kb_status`, `kb_supersede`, `kb_answer`, `kb_verify`, `kb_anchor_resolve`, `kb_reassess`,
`kb_load`, `kb_catalog`,
`kb_pack`,
`kb_query`, `kb_trace`, `kb_impact`, `kb_backlinks`, `kb_list`, `kb_index`, `kb_log`, `kb_stamp`,
`kb_validate`,
`kb_doctor`, `kb_schema`, `kb_types`, `kb_pin`, `kb_unpin`, `kb_pins`,
`kb_context`. Most take a `bundlePath`. The one CLI verb with no tool is
`sync-instructions`; the agent capability is `kb_context`.

`STRAUSS_KB_ACTOR` names the writer in the log; diagnostics go to stderr, since
stdout is the JSON-RPC transport. Per-tool schemas:
[mcp-reference](https://saasontools.github.io/strauss-agent-tools/mcp-reference).

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

`matchToDiff` takes hunks and optional symbol ranges rather than a patch,
answering which records are anchored to each hunk.

## Retrieval

Three axes decide whether a record answers a question, and only one is a search
problem:

| Axis      | Source                                                  | Question                        |
| --------- | ------------------------------------------------------- | ------------------------------- |
| Relevance | BM25 where an index exists, substring where it does not | does this match?                |
| Standing  | `strauss_status`, the supersession chain                | is this still what we hold?     |
| Freshness | `stale_after`, `verified[]`                             | has anyone confirmed it lately? |

**Load before you search.** These bases run to a few thousand tokens, and a
reader holding the whole base out-answers embedding search over the same records
([ARCHITECTURE.md](./ARCHITECTURE.md#load-beats-retrieval-while-the-base-fits)).
Read for a question, not for a session — a base loaded early in a long
conversation is summarised away by the end.

- `load` refuses rather than truncating past its budget (25,000 tokens default).
- `--all` (`all: true` over MCP) bypasses that refusal; it excludes `--budget`.
- Superseded records return as name, replacement and date only.
- `catalog` is the rung with no ceiling: one line per record, ~30 tokens each.
- `pack` is the middle rung: one record's neighbourhood, every cut named.
- `query` flags rather than filters — every hit arrives with its standing.
- `trace` orders by `generated.at` rather than ranking.
- Chains resolve on read: `chain-cycle`, forked heads, `broken-chain`.

Worked flows:
[use-cases](https://saasontools.github.io/strauss-agent-tools/use-cases).

**Placement is cache economics.** `load`'s output belongs in the stable
prefix — system prompt or first turn; `query` and `pack` results belong at
the tail. `digest` is the base's content stamp: `kb_stamp` and the opt-in
reload hook compare it to detect change, not the model. A
prompt cache matches a byte-for-byte prefix, so one volatile result ahead of
a stable load prices the base at full rate thereafter. Mechanism and digest
caveats: <https://saasontools.github.io/strauss-agent-tools/mcp-reference>.

## Health

`doctor` sweeps a base read-only for `expired`, `expiring`, `unverified`,
`aging`, `orphaned`, `broken-supersession`, `superseded-but-cited`, `drifted`,
and `unchecked`. All nine groups are reported even when empty; `--strict` gates
on expiry alone, not on drift. Pass `--repo-root PATH` when the base does not sit
inside the tree it describes.
Windows and judgments:
[cli-reference](https://saasontools.github.io/strauss-agent-tools/cli-reference).

## Living in an agent session

Compaction summarises away the records loaded early and the instruction to
consult them. The fix is two-tier: a small index re-injected at every context
birth, bodies fetched by tool when needed.

```bash
strauss-kb pin docs/kb                   # mark a base every session should see
strauss-kb context                       # emit the pinned index block
strauss-kb sync-instructions AGENTS.md   # or keep it in an instruction file
```

Pins live in `.strauss/kb-pins.json`, committed with the repo, over
`.strauss/kb-pins.local.json` (personal) and `~/.strauss/kb-pins.json` (every
workspace); nearest layer wins per base. Per pin: `--mode full` injects bodies,
`--mode index` never does, `--profiles a,b` narrows to named profiles, and
`--frozen` refuses writes until `--unfreeze`. Budgets are named profiles —
`session-start`, `compact`, `turn` — overridable per repo, so hook commands
carry no numbers:

```json
{
  "pins": [{ "path": "docs/adr", "mode": "full" }],
  "context": { "compact": { "budgetTokens": 1500 } }
}
```

A pinned base can also change mid-session — a `git pull`, a sub-agent's write.
`strauss-kb stamp` reports each pinned base's content digest. Comparing it for
you is opt-in, see the
[plugin README](../../plugins/strauss-kb/README.md#opt-in-workspace-hooks).

`sync-instructions <file>` keeps that block between
`<!-- strauss-kb:begin/end -->` sentinels in AGENTS.md or CLAUDE.md; it is
idempotent, and covers runtimes without a reliable post-compaction hook.

What each runtime gets (configs in the
[plugin's adapters](../../plugins/strauss-kb/adapters/)):

| Layer                     | Claude Code                      | Codex CLI                                   | Antigravity CLI            |
| ------------------------- | -------------------------------- | ------------------------------------------- | -------------------------- |
| MCP tool descriptions     | ✓                                | ✓                                           | ✓                          |
| Session-start injection   | SessionStart hook                | SessionStart hook                           | PreInvocation, per turn    |
| Post-compact re-injection | ✓ `compact` source               | ✓ client-side; instruction-only when hosted | moot — injected every turn |
| Reload after a pull       | opt-in PostToolUse, SubagentStop | opt-in PostToolUse on `shell`               | moot — injected every turn |
| File-read blocking        | opt-in PreToolUse                | ✗ (shell is the side door)                  | opt-in PreToolUse, JSON    |
| Manual-edit validation    | opt-in PostToolUse               | ✗                                           | ✗                          |
| Generated-file edit guard | opt-in PreToolUse                | ✗                                           | ✗                          |
| Instruction file          | CLAUDE.md                        | AGENTS.md                                   | AGENTS.md + rules/         |

Never read record files directly — read through the tools; a raw read bypasses
standing, and a superseded record reads exactly like a current one. Enforce it
with deny rules or the plugin's
[opt-in hook scripts](../../plugins/strauss-kb/README.md#opt-in-workspace-hooks),
which also cover manual edits to a bundle:

```json
{
  "permissions": {
    "deny": ["Read(.strauss/kb/**)", "Read(**/.strauss/kb/**)"]
  }
}
```

## Optional search tier

`@tobilu/qmd` is an **optional peer dependency** providing BM25 (`searchLex`, no
model download) over a `.index.sqlite` per base, rebuilt when a record is newer
than the index.

```bash
npm install -g @tobilu/qmd    # alongside a global strauss-kb
```

Absent — the default — `query` falls back to a substring scan over concept ids,
titles, descriptions, and bodies: nothing throws, only recall degrades. The
vector tier is off, since its scores do not separate right from wrong
([ARCHITECTURE.md](./ARCHITECTURE.md#what-happens-when-a-base-outgrows-a-context)).
qmd is used as a library, never through its own MCP server, which would bypass
the store.

## Constraints worth knowing

The store is the sole accessor, not merely the sole writer: excluding
store-owned files from listings and repairing the index on read hold only while
everything goes through one door. Cross-base questions are unaskable —
supersession, traces, and search stop at the directory boundary
([ARCHITECTURE.md](./ARCHITECTURE.md)).

## License

MIT
