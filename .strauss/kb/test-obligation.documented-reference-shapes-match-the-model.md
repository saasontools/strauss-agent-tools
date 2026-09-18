---
type: test-obligation
title: >-
  The documented reference shapes are the fields the model emits, and the
  example is the renderer's own line
description: >-
  A consumer branching on a documented field that nothing emits reads undefined
  as a value rather than as a removal.
tags:
  - review
  - "review:docs"
generated:
  by: mcp
  at: "2026-09-18T07:24:18.455Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-references/model.ts
    symbol: KbStaleReference
    hash: "sha256:009d747c7bb3026dcb653ea5d7570a7e5c4fb4ab5dbf5b71b663bdc1b2c47703"
    hash_kind: raw
    resolved_at: "2026-09-18T07:24:26.505Z"
    lines: 9
    resolver: regex
  - file: apps/strauss-kb-docs/docs/cli-reference.md
    hash: "sha256:dc5fd1dffa71bdb73dae78d34e568aaf0b08b87607307cdd4f891de817442b8d"
    hash_kind: raw
    resolved_at: "2026-09-18T07:24:26.524Z"
    lines: 946
  - file: apps/strauss-kb-docs/docs/mcp-reference.md
    hash: "sha256:2c3828d48962e705c5b632c6af0a4cc44821e89e6d390a9fb20a09816a4e9d06"
    hash_kind: raw
    resolved_at: "2026-09-18T07:24:26.524Z"
    lines: 633
strauss_links:
  - target: risk.the-reference-shapes-document-a-field-nothing-emits
    rel: satisfies
strauss_status: open
---

## Obligation

`cli-reference.md` documents `packet.references.outgoing` as `{ from, target, targetStanding, rels, replacedBy }` and `incoming` as `{ from, title, standing, rels }`; `mcp-reference.md` documents `kb_doctor`'s `reference` with the same outgoing shape. These are the fields of `KbStaleReference` and `KbLiveReference` in `kb-references/model.ts`, and nothing else. The rendered example is the line the CLI prints.

## Why it matters

These pages are the contract for the JSON surfaces. `origins` survived the removal of `KbReferenceOrigin` in both, and the example still showed the old renderer's `(link, related_to)`.

## How to verify

`grep -rn origins apps/strauss-kb-docs/docs packages/strauss-kb/src` returns nothing. The example line in cli-reference.md's `reassess` section is byte-identical to the one `test/cli.spec.ts` asserts against the built CLI: `- decision.retention [superseded] (related_to) — replaced by decision.retention-seven-days`.

Satisfies [risk.the-reference-shapes-document-a-field-nothing-emits](risk.the-reference-shapes-document-a-field-nothing-emits.md).
