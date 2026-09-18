---
type: test-obligation
title: >-
  sweep refuses a base whose prose cites what strauss_links does not declare,
  and sweeps safely once mirror-links has run
description: >-
  sweep's hold guard reads links only; on an unmigrated base it deletes what a
  prose-only citation still cites, and the plugin channel reaches that state
  with nobody watching.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T16:31:35.208Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: assertMigrated
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
strauss_links:
  - target: risk.unmigrated-base-loses-prose-edges
    rel: satisfies
strauss_status: open
strauss_supersedes:
  - test-obligation.the-migration-is-safe-to-run-and-unsafe-to-skip
---

## Obligation

`sweep`, dry run included, throws `KbUnmigratedBaseError` before computing a single candidate when any record has an unmirrored citation or a body the parser refuses. The error names each record and why, tells the reader to run `strauss-kb mirror-links`, and nothing in the base changes. After `mirror-links`, the same base sweeps and the formerly prose-only citation holds its target. `mirror-links` itself stays safe to run: it mirrors what the prose states, leaves a target already carrying a rel alone, ignores code, is idempotent, writes nothing under `--dry-run`, refuses a frozen base, and adds against the record as it stands.

## Why it matters

This is the only guard between an auto-upgraded base and a deletion, and it must hold on the dry run too — a dry run that lists a candidate the real run then deletes is the failure the SAA-810 base showed.

## How to verify

`src/commands/sweep.spec.ts` — "refuses an unmigrated base, dry run included, and deletes nothing", "sweeps once mirror-links has run, and keeps what the prose cited", "refuses a base holding a body it cannot read". Against the built CLI: `sweep --tag review --terminal --dry-run` on such a base exits 1 naming the record, and 0 with the target under `kept` after `mirror-links`. `src/commands/mirror-links.spec.ts` covers the migration.

Satisfies [risk.unmigrated-base-loses-prose-edges](risk.unmigrated-base-loses-prose-edges.md).
