---
type: test-obligation
title: "The both-halves rule is stated once per surface, and no comment argues for it"
description: >-
  Six copies of one rule disagree the first time it changes, and the reader gets
  whichever home they opened.
tags:
  - review
  - "review:docs"
generated:
  by: mcp
  at: "2026-09-17T19:10:39.945Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/ARCHITECTURE.md
    hash: "sha256:a37af1477d3bfe5c2286ac6aac5fee39dee62abf704b95ee015ba3a9a00e22e6"
    hash_kind: raw
    resolved_at: "2026-09-17T19:10:56.359Z"
    lines: 263
strauss_links:
  - target: risk.both-halves-rule-has-six-homes
    rel: satisfies
strauss_status: open
---

## Obligation

`packages/strauss-kb/ARCHITECTURE.md` and `decision.edge-consumers-read-body-and-frontmatter` are the two homes: the rule with its reason, and the judgment behind it. Every other surface states only what its own reader needs at the moment of use and links rather than restates — the README links to the docs site, the CLI and MCP references say what the command does, `SKILL.md` says what an agent must do. A code comment states the invariant in four lines or fewer; the rationale lives in the two homes.

## Why it matters

`AGENTS.md` makes this a reason to reject a change on prose length alone, and the specific failure is a reader acting on a rule that was edited everywhere but the file they opened.

## How to verify

`grep -rn "both halves" apps/strauss-kb-docs/docs packages/strauss-kb/README.md packages/strauss-kb/ARCHITECTURE.md plugins/strauss-kb/skills packages/strauss-kb/src` returns at most one statement of the rule per surface, and no doc comment in `kb-references/`, `sweep.ts`, `doctor.ts`, `validate.ts`, `packet.ts` or `reassess.ts` runs past four lines arguing for it. No sentence appears verbatim in two files.

Satisfies [risk.both-halves-rule-has-six-homes](risk.both-halves-rule-has-six-homes.md).
