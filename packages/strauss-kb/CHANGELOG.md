## Unreleased

### 🚀 Features

- strauss-kb anchors gain content hashes and drift detection: `strauss_anchors` entries may carry `hash` (`sha256:<hex>`), `lines`, and `resolved_at`, all optional so existing anchors stay valid; the new `kb_anchor_resolve` (CLI `anchor-resolve`) resolves a record's anchors against the working tree — stamping a hash onto anchors that lack one, refreshing matches, and reporting drift with a line-count diff size — exits non-zero on drift so a CI gate can run it, and takes `--rebaseline` to accept the current code as the new baseline; an all-match run appends a verified[] event under the same verifier-identity rule as kb_verify (a self-resolve reports `verifyRefused: "self-verification"` instead of verifying); kb_load and kb_query attach a `{ kind: "drifted" }` warning to records whose anchored code moved; resolution is a pluggable `AnchorResolver` interface with a regex-on-symbol-name v1 resolver

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