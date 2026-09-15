---
type: decision
title: The root depends on the workspace strauss-kb so the review hooks find the CLI
description: >-
  The gate and reviewer hooks resolve the CLI by walking up to
  node_modules/@saasontools/strauss-kb/dist/cli-main.js; without a root link
  they fall back to PATH, which a fresh checkout does not have. package.json
  gains devDependency @saasontools/strauss-kb: workspace:*, and one build per
  checkout is documented in AGENTS.md.
tags:
  - review
  - "review:config"
generated:
  by: "agent:author"
  at: "2026-09-15T07:46:29.992Z"
verified:
  - by: unknown
    at: "2026-09-15T07:48:16.530Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:23:45.501Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:24:11.819Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:33:11.106Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:34:52.863Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:37:43.133Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:38:14.603Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:45:16.406Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:48:11.195Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:49:22.085Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:01:44.266Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: package.json
    hash: "sha256:c4ffa90943581fc1e277786e86e3dd9072d57477ef56bacbaf8e086e188c3686"
    hash_kind: raw
    resolved_at: "2026-09-15T07:46:42.708Z"
    lines: 62
strauss_status: accepted
---

## Decision

The root depends on the workspace strauss-kb so the review hooks find the CLI

## Rationale

The gate and reviewer hooks resolve the CLI by walking up to node_modules/@saasontools/strauss-kb/dist/cli-main.js; without a root link they fall back to PATH, which a fresh checkout does not have. package.json gains devDependency @saasontools/strauss-kb: workspace:*, and one build per checkout is documented in AGENTS.md.

## Rejected

STRAUSS_KB_BIN in .claude/settings.json env — settings env values are literal, so the path would be absolute and per machine. A global npm install — pins a published version, not the checkout.

## Impact

Hooks work in any checkout after one build. The root package is never published, so the dependency has no release effect.
