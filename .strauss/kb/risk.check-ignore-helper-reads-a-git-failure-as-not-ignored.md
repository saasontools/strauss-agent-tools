---
type: risk
title: The git spec's `ignored` helper cannot tell "not ignored" from "git failed"
description: >-
  The assertions that prove the rules do not over-reach can pass without git
  answering.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T18:11:31.223Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.git.spec.ts
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: medium
---

## Risk

ignored() (kb-gitignore.git.spec.ts:28-35) catches every execFileSync throw and returns false, so exit 1 (git says: not ignored) and exit 128 (fatal — unusable path, no repository, no git) are the same answer. Its comment claims the opposite: "by its exit status rather than its output". Every `toBe(false)` assertion — lines 73, 86, 91, 102 — is the one that proves a rule does not over-reach, and each passes when git never answered.

## Why it matters

This suite is the only place the rules meet real git, and it runs on windows-latest and macos-latest in CI's build-cross-platform job with path arguments built by node's join, so Windows sends `.strauss\kb-pins.local.json`. A systematic failure is still caught by the neighbouring `toBe(true)`; a path-specific one is not, and the suite reports green.

## Mitigation

None in the diff. Read the status: treat exit 1 as "not ignored" and anything else as a test failure — execFileSync's error carries `status`.

## Verification

Point the helper at a path outside any repository and the spec fails rather than reporting "not ignored".
