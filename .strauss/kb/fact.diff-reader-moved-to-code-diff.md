---
type: fact
title: >-
  The diff parser, readRangeDiff and the diff types moved from strauss-kb into
  code-diff
description: >-
  code-diff/src/repo/diff.ts reads as a new file, and the strauss-kb barrels
  lose exports, but the logic is not new.
tags:
  - review
  - "review:move"
generated:
  by: mcp
  at: "2026-09-15T15:30:02.684Z"
verified: []
strauss_anchors:
  - file: packages/code-diff/src/repo/diff.ts
    symbol: readRangeDiff
    hash: "sha256:4319c2b43d8828b8f538ec45d67434ef8514d5981da374f856fe820f68a1918e"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.279Z"
    lines: 9
    resolver: tree-sitter
  - file: packages/code-diff/src/parse-unified-diff.ts
    symbol: parseUnifiedDiff
    hash: "sha256:003ee2c0d5459df9cd10f901b339c47ca665e77b19e3cec58d87de1ed80d1f25"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.298Z"
    lines: 105
    resolver: tree-sitter
  - file: packages/code-diff/src/model.ts
    symbol: DiffHunk
    hash: "sha256:d2c102f6c2f8285c701fbbd679e88573eae7316c7f9c0288100b6f38743cf8f4"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:34.300Z"
    lines: 10
    resolver: regex
  - file: packages/strauss-kb/src/match-diff.ts
    symbol: matchToDiff
    hash: "sha256:4d58a2fbcfd6e41270a04ebcafed03cba1c3310ad5ca8edebef4f31cb2b5df27"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.305Z"
    lines: 45
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/match/command.ts
    symbol: project
    hash: "sha256:32a5738de2d83a5d754e9965a22c176e7c21c7604e88288bf49a378c003737e9"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.309Z"
    lines: 46
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/match/model.ts
    symbol: KbMatch
    hash: "sha256:404975239232f24731bac1dd9308d20cdd265931b6ab4488d498b23255c0271c"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:34.312Z"
    lines: 7
    resolver: regex
  - file: packages/strauss-kb/src/commands/match/symbol-ranges.ts
    symbol: resolveSymbolRanges
    hash: "sha256:4fa94b1832666f78ed434748bb5c05d3673b4013247053c8442d7b2ebca39e04"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.315Z"
    lines: 44
    resolver: tree-sitter
  - file: packages/strauss-kb/src/drift/index.ts
    hash: "sha256:451f84498a9de88da3b0cc77c5b154041f2c874366cdfe67a1e0d2e0b8059134"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:34.315Z"
    lines: 41
  - file: packages/strauss-kb/src/commands/match/index.ts
    hash: "sha256:3af65d56ccf43cf4e5fd9ee1bcdcdc9333d1187b0c6c85795f10db34c7dd10da"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:34.315Z"
    lines: 10
strauss_verify:
  - >-
    cd packages/code-diff && pnpm vitest run src/repo/diff.spec.ts
    src/parse-unified-diff.spec.ts
  - >-
    cd packages/strauss-kb && pnpm vitest run src/commands/match
    src/match-diff.spec.ts
strauss_status: accepted
---

## Claim

readRangeDiff is strauss-kb drift/git.ts's, same argv, shape checks, caps and refusal reasons; only the spawn moved to git-guard's runGit. parse-unified-diff.ts moved by git mv and gained the opt-in withContext. DiffHunk, DiffFile and SymbolRange moved out of match-diff.ts; DiffHunk gained an optional `context`. drift/index.ts and commands/match/index.ts only drop the re-exports of what moved.

## Evidence

readRangeDiff's refusal tests moved with it, unchanged, to code-diff/src/repo/diff.spec.ts; the parser spec moved whole and gained one withContext case; match --git output is unchanged in strauss-kb's suite.
