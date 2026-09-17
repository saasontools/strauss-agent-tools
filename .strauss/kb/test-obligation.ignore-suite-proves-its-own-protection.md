---
type: test-obligation
title: "The git suite fails when the rule is not written, whatever the machine ignores"
description: >-
  A suite that inherits the contributor's excludes can pass with the writer
  gutted, which is the one thing it exists to catch.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T18:42:01.439Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.git.spec.ts
    hash: "sha256:9a4b5e2a5a73ae2d446bbded6380b43743ccd3a5a03fb3546b7bf8c9e68da921"
    hash_kind: raw
    resolved_at: "2026-09-17T18:42:13.926Z"
    lines: 197
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureGitignore
    hash: "sha256:65416677a90e7227e9aeab3ac2bb03cc86a3ba35dc4bccd180cab0e92beda774"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:13.947Z"
    lines: 12
    resolver: tree-sitter
strauss_links:
  - target: risk.git-spec-reads-the-machines-global-excludes
    rel: satisfies
  - target: risk.base-negation-suppresses-the-index-rule-in-silence
    rel: satisfies
strauss_status: open
---

## Obligation

kb-gitignore.git.spec.ts spawns every git with GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM pointed at an empty file in the test's own tmpdir — not the null device, which git rejects as a config path on Windows, where this suite runs in CI's cross-platform job.

kb-store.spec.ts: a base whose .gitignore holds `!.index.sqlite-wal` is left as written, and the warn names the suppressed pattern.

## Why it matters

Checked by construction: with `ensureGitignore` made a no-op and a global excludes file holding `.index.sqlite*`, three cases fail. Before the isolation they passed, and the protection they assert was never written.

## How to verify

GIT_CONFIG_GLOBAL=<config naming an excludes file with .index.sqlite*> pnpm vitest run src/kb-gitignore.git.spec.ts, with ensureGitignore returning early: three failures.

Satisfies [risk.git-spec-reads-the-machines-global-excludes](risk.git-spec-reads-the-machines-global-excludes.md).

Satisfies [risk.base-negation-suppresses-the-index-rule-in-silence](risk.base-negation-suppresses-the-index-rule-in-silence.md).
