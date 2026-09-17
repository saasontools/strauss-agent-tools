---
type: risk
title: >-
  The git spec inherits the developer's global excludes file, so a missing rule
  can read as present
description: >-
  The one suite that proves the rule was written can answer from the machine
  instead.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:33:44.847Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.git.spec.ts
    symbol: ignored
    hash: "sha256:abd2ca94cde55c4d570834387140bed05471fa0420d4b7d378920bfc7883b72c"
    hash_kind: ast
    resolved_at: "2026-09-17T18:35:06.581Z"
    lines: 25
    resolver: tree-sitter
strauss_links:
  - target: test-obligation.ignore-reader-agrees-with-git
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

The `ignored` helper (kb-gitignore.git.spec.ts:43-67) spawns `git check-ignore --no-index` with the process environment untouched: no GIT_CONFIG_GLOBAL, no GIT_CONFIG_SYSTEM, no `-c core.excludesFile=`. check-ignore consults `core.excludesFile` and `~/.config/git/ignore` like any other read. Reproduced: with the store's `.gitignore` absent from the base and a global excludes file holding `.index.sqlite*`, `check-ignore -v --non-matching .strauss/kb/.index.sqlite` exits 0 and names the global file as the source, so the helper returns true.

## Why it matters

The assertions at lines 104 and 117 are the protection itself — that ensureGitignore wrote a rule excluding the index and its sidecars. A contributor who keeps `*.sqlite*` or `.index.*` in their personal excludes runs a suite that passes with `ensureGitignore` gutted. The same inheritance lets `init.templateDir` seed the throwaway repo; check-ignore runs no hook, so that half is noise, not execution.

## Mitigation

None in the diff. Scope the child's environment in the `git` helper: GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM pointed at an empty file in the test's own tmpdir. Not the null device — git rejects it as a config path on Windows, and this suite runs on windows-latest.

## Verification

Put `.index.sqlite*` in a global excludes file, delete the ensureGitignore call, and the suite fails rather than passing.

Informs [test-obligation.ignore-reader-agrees-with-git](test-obligation.ignore-reader-agrees-with-git.md).
