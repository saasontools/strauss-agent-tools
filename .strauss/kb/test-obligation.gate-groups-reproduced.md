---
type: test-obligation
title: >-
  The review gate reproduces every fixture scenario's gate groups against the
  new classify
description: >-
  The plugin's scripts are unchanged, but the classes they read come from the
  classify CLI this change rewrites.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T15:29:53.286Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/fixture.spec.mjs
    hash: "sha256:efb869871775fe91f2d23a0db66ce9f4f0b0d00bf1c8ea2ad01feeb377b10bdb"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:33.930Z"
    lines: 111
strauss_status: resolved
---

## Obligation

`--report` over every companion-fixture branch, with the workspace CLI, blocks on exactly the groups each expected.json names — including the new head-attribute-ignored.

## Why it matters

A class that moved under the hook shows up as a new or missing gate group, which is a plugin behaviour change.

## How to verify

pnpm nx run @saasontools/strauss-kb:build && node --test plugins/strauss-kb-review/hooks/scripts/fixture.spec.mjs
