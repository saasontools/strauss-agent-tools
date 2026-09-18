## 0.1.22 (2026-09-18)

### 🩹 Fixes

- `anchor-set` (MCP `kb_anchor_set`) sets a record's anchors after a refactor a ([71c98ed](https://github.com/saasontools/strauss-agent-tools/commit/71c98ed))
  reader identified: the complete new set and a required reason. Carry an
  anchor's `hash` forward and the code behind a moved pointer still reports drift
  until `anchor-resolve --rebaseline` accepts it; leave it off and the resolver
  stamps current code. Two anchors at one address are refused, here and at a
  record's first write. `--resolve` (MCP `resolve`) also stamps every anchor
  against the current code in the same call. Never verifies or moves standing.

  The change lands as an `anchor-set` log entry carrying the reason and every
  pointer that moved, derived from the record before and after. `reason` and
  `anchors` are new optional fields on the log entry, and the log's **read**
  schema now keeps unknown keys instead of refusing them, so a base written by a
  later version stays readable; the write schema stays strict. A reader older
  than this release reports `anchor-set` lines as malformed, which is what the
  change exists to stop happening again. `updateAnchors` now also takes a
  function computing the anchors from the record's current ones.

### ❤️ Thank You

- assafk
- Claude Opus 5

## 0.1.21 (2026-09-16)

### 🩹 Fixes

- `anchor-resolve` no longer writes `verified[]`: an anchor's `hash` and ([e40485f](https://github.com/saasontools/strauss-agent-tools/commit/e40485f))
  `resolved_at` are the mechanical evidence, and `verified[]` holds judgments. Its
  result drops `verified` and `verifyRefused`. `--check` (MCP `check`) resolves
  and reports without writing anything. `verify` refuses the actor `unknown`, and
  every write refuses an actor that is not `kind` or `kind:name`.

### ❤️ Thank You

- assafk
- Claude Opus 5

## 0.1.20 (2026-09-15)

### 🩹 Fixes

- Git hygiene for a base that is committed and reviewed on GitHub: `.gitattributes` ([5dc9a6c](https://github.com/saasontools/strauss-agent-tools/commit/5dc9a6c))
  marks `INDEX.md`, `log.jsonl` and `.index.sqlite` `linguist-generated`, so a pull
  request collapses them and shows the records; the log reader reads past the
  conflict markers GitHub's merge button leaves, keeping both sides' entries. New
  `sweep` / `kb_sweep` deletes tagged records in a terminal status — the one verb
  that removes rather than supersedes.

- In a diff a lockfile bump and a change worth reading look the same, so a ([3a22b4b](https://github.com/saasontools/strauss-agent-tools/commit/3a22b4b))
  reviewer has to open both. `classify --git <base>..<head>` / `--stdin` and
  `kb_classify` label every changed file with one of `test`, `config`, `ci`,
  `docs`, `lockfile`, `generated`, `boilerplate`, `rename` or `source`, and name
  the rule that decided it. The rules are a fixed table — a generator's banner,
  then paths, then rename, then the share of changed lines that is import/export
  shape — and a `fact` tagged `review:generated`, `review:boilerplate` or
  `review:move`, anchored on a file, overrides all of them. No class is stored:
  the patch already says it. `parseUnifiedDiff` gains `keepEmpty` and `withLines`
  and now reads `rename from` / `similarity index` onto every file.

- A knowledge base written during review dies with the branch, and nothing ([b68c22d](https://github.com/saasontools/strauss-agent-tools/commit/b68c22d))
  carried the records worth keeping into the base that outlives it.
  `kb_promote` / `strauss-kb promote` copies chosen records across: they land
  `accepted`, the review tags stripped, the pull request recorded as a source,
  and both bases logged. `promote --list` names the records usually worth taking.
  Separately, `kb_export --format madr` writes a base's decisions out as numbered
  MADR files, for a repository that keeps ADRs in-tree; a decision keeps the
  number it was first exported under.

- Asking which records sit on a change meant importing the package, so a ([9d49190](https://github.com/saasontools/strauss-agent-tools/commit/9d49190))
  reviewer, a CI gate or a desktop client could not ask at all. `kb_match` and
  `strauss-kb match` answer it from outside: give them changed files with line
  ranges and they return the records anchored to each hunk, current first, with
  each record's standing and the anchor that matched. A hunk marked
  `side: "old"` numbers the lines the change removed, so records anchored to
  deleted code surface too. Symbols are resolved through the package's own
  tree-sitter chain unless the caller supplies ranges. The CLI can read a commit
  range itself — `match --git <base>..<head>` — or take the same JSON on
  `--stdin`.

- An anchor could only name a symbol, so a decision about a YAML block or a SQL ([cfa63fc](https://github.com/saasontools/strauss-agent-tools/commit/cfa63fc))
  migration was pinned to the whole file, and code a change deleted could not be
  anchored at all. Two new addresses fix that. `span: { start, end }` names a
  line range, hashed as written, for files no resolver can name a symbol in.
  `side: "old"` with a `ref` names code as it was at that commit, read from git
  history, so a record can point at what a refactor removed; it never drifts,
  and a commit this clone lacks reports `ref-unavailable` (unchecked) rather than
  gone. `kb_match` keeps old-side and new-side hunks apart, `kb_validate` rejects
  an anchor carrying both addresses, and `kb_doctor` counts spans and old-side
  anchors.

### ❤️ Thank You

- assafk
- Claude Fable 5.1

## 0.1.19 (2026-09-06)

### 🩹 Fixes

- Select records by frontmatter `tags`: `kb_list`, `kb_query` and `kb_catalog` ([1da3cf3](https://github.com/saasontools/strauss-agent-tools/commit/1da3cf3))
  take a `tags` array (CLI `--tag`, repeatable) and return the records carrying
  every tag in it, and a `kb_context` profile takes `excludeTags` to keep tagged
  records out of the injected block without unpinning the base. Selection runs
  after adjudication, so standing and supersession are unchanged, and the
  vocabulary is not enforced.

### ❤️ Thank You

- assafk
- Claude Fable 5.1

## 0.1.18 (2026-09-06)

### 🩹 Fixes

- Classify anchor drift as moved, cosmetic, gone or changed, and hand what is ([0d4115d](https://github.com/saasontools/strauss-agent-tools/commit/0d4115d))
  left to a reader as a packet: the record's claim, an old-vs-new span diff, and
  its impact set. `kb_reassess`, `kb_doctor --drifted`, a `drifted` count on
  `kb_stamp`.

### ❤️ Thank You

- assafk
- Claude Fable 5.1

## 0.1.17 (2026-09-05)

### 🩹 Fixes

- Anchor symbols resolve through tree-sitter — 20 languages, each with its grammar's own upstream definitions query — before the regex heuristic, and each anchor records which resolver stamped it. A symbol its tags query does not define — a constant, a type alias, a class field — falls through to regex and records `resolver: regex`. New reasons: `symbol-ambiguous`, `resolver-unavailable`, and `resolver-changed` drift, which `--rebaseline` accepts. Grammars are not published with the package — each downloads on first use, verified against the sha256 pinned in `grammars/manifest.json` and cached under `~/.strauss/grammars`; `--offline` or `STRAUSS_KB_GRAMMARS=off` reads the cache only and reports `resolver-unavailable` rather than falling back to regex. ([3280cae](https://github.com/saasontools/strauss-agent-tools/commit/3280cae))

### ❤️ Thank You

- assafk
- Claude Fable 5.1

## 0.1.16 (2026-09-04)

### 🩹 Fixes

- Add `kb_stamp` / `strauss-kb stamp`: a base's content digest, counts, and a ([eb5eef3](https://github.com/saasontools/strauss-agent-tools/commit/eb5eef3))
  digest per record, with no bodies. The plugin ships an opt-in
  `kb-stamp-hook.mjs` that compares it and says which pinned base to load again
  after a `git pull` or a sub-agent's write.

### ❤️ Thank You

- assafk
- Claude Fable 5.1

## 0.1.15 (2026-09-04)

### 🩹 Fixes

- An anchor naming another repository now resolves against that repository's remote through a bare cache under `~/.strauss/repo-cache`, instead of being skipped as `foreign-repo`. A pinned `ref` gets three states (`matches-ref`, `drifted-from-ref`, `drifted-on-default`); `--offline` reads the cache without fetching, and `kb_load`/`kb_query`/`kb_doctor` report what they could not reach as `unchecked`. ([cebf5ad](https://github.com/saasontools/strauss-agent-tools/commit/cebf5ad))

### ❤️ Thank You

- assafk
- Claude Fable 5.1

## 0.1.14 (2026-09-03)

### 🩹 Fixes

- Terse MCP tool descriptions (~2,300 → ~1,100 tokens per context), and shorter README, ARCHITECTURE and docs. No behaviour change. ([8ca35a3](https://github.com/saasontools/strauss-agent-tools/commit/8ca35a3))

### ❤️ Thank You

- assafk
- Claude Fable 5.1

## 0.1.13 (2026-09-03)

### 🩹 Fixes

- typed causal edges (strauss_links) with kb_impact and kb_backlinks ([54ee155](https://github.com/saasontools/strauss-agent-tools/commit/54ee155))

  Records may carry `strauss_links` — `{ target, rel }` edges from a closed
  vocabulary of eight, reading source → target on the source's frontmatter and
  also rendered as one prose sentence per rel. Each rel declares which of its two
  ends depends on the other; `kb_impact` walks the transitive dependants in that
  direction, `kb_backlinks` is the flat one-hop counterpart, and
  `kb_pack`/`kb_trace` follow the new `typed-link` edge kind. `kb_validate`
  findings now carry `severity` — an unknown rel or malformed target is an
  `error`, an absent target a `warning`, only errors fail the exit code — so
  every finding object has one more key.

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.12 (2026-09-03)

### 🩹 Fixes

- kb_load: bundle content digest and cache-stable placement rule ([6840983](https://github.com/saasontools/strauss-agent-tools/commit/6840983))

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.11 (2026-09-03)

### 🩹 Fixes

- anchor content hashes and drift detection (`strauss_anchors`), with an `anchor-resolve` command and a `kb_doctor` drifted check. Anchors gain optional `repo` and `ref`: an anchor naming another repository is skipped as `foreign-repo`, and `ref` is recorded but not yet used for resolution. ([](https://github.com/saasontools/strauss-agent-tools/commit/))

## 0.1.10 (2026-09-03)

### 🩹 Fixes

- kb_catalog: a tier-one listing, and a refusal that names the next call ([dd3b314](https://github.com/saasontools/strauss-agent-tools/commit/dd3b314))

  New `kb_catalog` (CLI `catalog [type]`) lists every record in one line — id, type, title, standing, stale flag — sorted by type then title, at roughly thirty tokens each, and never refuses: it is where a refused `kb_load` sends you. `kb_load`'s refusal now names the next calls (`kb_catalog`, then `kb_pack` on the record that matters; `kb_query` for a lookup by wording) and both escape hatches, instead of only reporting that the base was too big. CLI flags now accept `--flag=value` and error on a missing value instead of silently falling back to the default.

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.9 (2026-09-02)

### 🩹 Fixes

- cross-worktree log safety: union merge for log.md and atomic appends ([dd6ec3a](https://github.com/saasontools/strauss-agent-tools/commit/dd6ec3a))

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.8 (2026-09-02)

### 🩹 Fixes

- kb_doctor: a read-only health sweep for expired, unverified, aging, and orphaned records. ([74d1b48](https://github.com/saasontools/strauss-agent-tools/commit/74d1b48))

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.7 (2026-08-26)

### 🚀 Features

- strauss-kb gains kb_pack (CLI `pack`): the bounded, standing-aware neighbourhood around one record — a walk over body links, supersession in both directions, shared anchors, and shared sources, capped by `hops` and `maxNodes` with every cut record named under Excluded; superseded neighbours arrive as stubs, the pack refuses rather than truncates past its token budget, and everything below the header is byte-identical across runs over an unchanged base

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.6 (2026-08-26)

### 🩹 Fixes

- strauss-kb gains kb_verify: append-only verified[] events with a required note, refused with a distinct log entry when a non-human actor verifies its own record ([cd96238](https://github.com/saasontools/strauss-agent-tools/commit/cd96238))

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.5 (2026-08-25)

### 🚀 Features

- kb_load gains an explicit unbounded mode: `all: true` (CLI `--all`) loads the entire bundle regardless of budget, mutually exclusive with `budgetTokens`; loaded results now carry `tokensLoaded` (renamed from `approxTokens`) and `budgetTokens: null` when no ceiling was applied ([2d15e14](https://github.com/saasontools/strauss-agent-tools/commit/2d15e14))

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.4 (2026-08-25)

### 🩹 Fixes

- `write` (and `write-decision`) with `supersedes` now marks the prior record superseded, not only the new record's forward pointer; the write still succeeds when a `supersedes` id names a record that does not exist yet. `kb_write`/`kb_write_decision` return `{ conceptId, action, supersededIds }`, and a 409 concept-id collision carries `action: "refused"`. A concurrent CAS conflict on one of the superseded targets now retries a bounded number of times and, if still conflicting, is left out of `supersededIds` instead of failing the whole write; a record naming its own concept id in `supersedes` is ignored rather than superseding itself; duplicate ids in `supersedes` are marked once; and `supersedes` is capped at 32 entries. ([406a703](https://github.com/saasontools/strauss-agent-tools/commit/406a703))

### ❤️ Thank You

- assafk
- Claude Fable 5

## 0.1.2 (2026-08-17)

### 🩹 Fixes

- Ship ARCHITECTURE.md with the package ([21c54eb](https://github.com/saasontools/strauss-agent-tools/commit/21c54eb))

### ❤️ Thank You

- assafk
- Claude Opus 5

## 0.1.1 (2026-08-16)

### 🩹 Fixes

- Knowledge base as a library, a CLI, and an MCP server over one command table: markdown records with standing, supersession, and trace, in a self-contained directory. ([996f40f](https://github.com/saasontools/strauss-agent-tools/commit/996f40f))

### ❤️ Thank You

- assafk
- Claude Opus 5