---
type: decision
title: >-
  The default path table applies only when attributes were read at the base and
  none above a changed file names a class
description: >-
  SAA-810 keeps a few-line table for repos with no attributes. It lowers classes
  nothing in the repo declared, so it may apply only where the base was read and
  said nothing.
tags:
  - review
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T16:01:04.377Z"
verified:
  - by: unknown
    at: "2026-09-15T16:01:41.304Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:36.222Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:26.932Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:26.736Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
  - by: "agent:security"
    at: "2026-09-15T16:11:25.688Z"
    note: >-
      Read readAttributes/declaresClasses at 8f85584: no base, unpinned read or
      failed probe keeps repoDeclares true; unpinned keeps only
      strauss-class=source.
  - by: "agent:performance"
    at: "2026-09-15T16:12:50.430Z"
    note: >-
      declaresClasses at 8f85584 is one cat-file --batch over
      attributeFiles(paths), 10 s timeout, 16 MB cap. Measured: 28.5 ms for this
      range's 42 lines, 56 ms for all 209 directories here, 1.1 s for 10 101.
      Cost follows the diff's directories, not the tree.
  - by: unknown
    at: "2026-09-15T16:13:09.842Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:46.586Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:32.878Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T16:34:55.620Z"
    note: >-
      readAttributes returns repoDeclares true when unpinned or the probe is
      null; classifyFile applies pathRule only when !repoDeclares;
      draftGitattributesFrom proposes test dirs, docs/, lock files, CI, suffixes
      and build output, never *.md; -t 'repoDeclares|attributeFiles' passes 9.
  - by: unknown
    at: "2026-09-15T16:35:42.012Z"
    note: "anchor-resolve: 8/8 anchors match (regex + tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: declaresClasses
    hash: "sha256:bbb45d4fdc66deaf5533bb02bff348b0d0c9a28d114683c4f17e2f7d3a07b5ff"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:36.591Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: attributeFiles
    hash: "sha256:60ad85ae048d5a5dfbada1a61da164a327a9aa90b12d70d810ad06ae9cd47a6d"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:32.270Z"
    lines: 11
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/rules.ts
    symbol: pathRule
    hash: "sha256:981101a7519cf0706373db72457b28768f40f4b431139766de1ffe4b4ac4bbf2"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:32.275Z"
    lines: 4
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/rules.ts
    symbol: attributeVerdict
    hash: "sha256:de9892071971372bb0319629aafe6796fe5eb511fa9cfd7c8ec3b69b746f74f3"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:32.276Z"
    lines: 17
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/model.ts
    symbol: Verdict
    hash: "sha256:1fdb6f28162b29b852347684fb4f8294dcbdf013ff0a987bf940676a2f707cff"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:32.279Z"
    lines: 1
    resolver: regex
  - file: packages/code-diff/src/draft-gitattributes.ts
    symbol: draftGitattributesFrom
    hash: "sha256:330fca1c2e903ff1bdfb8bca2c78e980d8895bed45caefb2d7b84ab720ee04fd"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:32.287Z"
    lines: 34
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/classify.ts
    symbol: kbDeclared
    hash: "sha256:970a0146bf4f7d49ecec1d78702964c56ebdadad65dc7a8586dadbf96146205a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:32.290Z"
    lines: 24
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/model.ts
    symbol: KbClassifyOptions
    hash: "sha256:6a9d7f22f1dc46f785d3f8e47406df5cda312fd9f6c64c6c0fc4eb2527230720"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:32.292Z"
    lines: 11
    resolver: regex
strauss_status: accepted
strauss_supersedes:
  - decision.default-table-only-without-declared-classes
---

## Decision

The default path table applies only when attributes were read at the base and none above a changed file names a class

## Rationale

SAA-810 keeps a few-line table for repos with no attributes. It lowers classes nothing in the repo declared, so it may apply only where the base was read and said nothing.

## Rejected

The first cut: a git grep over every .gitattributes at the base that fell toward the table on any failure — a whole-tree walk (about 9 s at 1M files, killed by the 10 s timeout) and a failure that lowered classes. Before that, the table as a per-path fallback in repos that do declare.

## Impact

One cat-file --batch over the root's .gitattributes and those above changed files decides; any mention of a class attribute counts. No base, an unpinned read or a failed probe keeps the table off. strauss-class=source is honoured beside test|ci|config|lockfile, and alone when the read is unpinned. draftGitattributes proposes lock files, CI, test directories and suffixes, docs/ and build output, not _.md. strauss-kb keeps only the review:_ facts, as code-diff's Declared lookup.

Relates to [risk.declares-classes-failure-turns-path-table-on](risk.declares-classes-failure-turns-path-table-on.md).

Relates to [risk.classify-base-grep-walks-whole-tree](risk.classify-base-grep-walks-whole-tree.md).

[^saa-810]: https://linear.app/saason/issue/SAA-810
