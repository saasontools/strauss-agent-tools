---
type: test-obligation
title: '"strauss_links is the edge" has two homes, and no comment argues for it'
description: >-
  Six copies of one rule disagree the first time it changes, and the reader gets
  whichever home they opened.
tags:
  - review
  - "review:docs"
generated:
  by: mcp
  at: "2026-09-17T21:32:11.259Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/ARCHITECTURE.md
    hash: "sha256:3d86d5feb596e74a012150b6c0aa05f54e8ae4c915407bf0f02d86585152a696"
    hash_kind: raw
    resolved_at: "2026-09-17T21:32:21.822Z"
    lines: 268
strauss_links:
  - target: risk.both-halves-rule-has-six-homes
    rel: satisfies
strauss_status: open
strauss_supersedes:
  - test-obligation.both-halves-rule-stated-once-per-surface
---

## Obligation

`packages/strauss-kb/ARCHITECTURE.md` and `decision.strauss-links-is-the-one-representation` are the two homes: the rule with its reason, and the judgment behind it. Every other surface states only what its own reader needs at the moment of use and links rather than restates — the README links to the docs site, the CLI and MCP references say what the command does, `SKILL.md` says what an agent must do. A code comment states the invariant in four lines or fewer.

## Why it matters

`AGENTS.md` makes this a reason to reject a change on prose length alone, and the specific failure is a reader acting on a rule that was edited everywhere but the file they opened. The rule has already been rewritten once inside this change — from "every consumer reads both halves" to "prose is rendering" — which is exactly the edit that leaves stale copies behind.

## How to verify

`grep -rn "is the edge\|rendering of an edge\|reads a body" apps/strauss-kb-docs/docs packages/strauss-kb/README.md packages/strauss-kb/ARCHITECTURE.md plugins/strauss-kb/skills packages/strauss-kb/src` returns at most one statement of the rule per surface, and no doc comment runs past four lines arguing for it. No sentence appears verbatim in two files. Nothing anywhere still says a consumer reads both halves.

Satisfies [risk.both-halves-rule-has-six-homes](risk.both-halves-rule-has-six-homes.md).
