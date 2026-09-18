---
type: risk
title: >-
  cli-reference and mcp-reference give the reference shapes an `origins` field
  the code deleted
description: >-
  A client coding against the documented JSON reads undefined, and the worked
  example prints a rel that does not exist.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T21:48:51.602Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-references/model.ts
    symbol: KbStaleReference
  - file: apps/strauss-kb-docs/docs/cli-reference.md
  - file: apps/strauss-kb-docs/docs/mcp-reference.md
strauss_links:
  - target: decision.reassess-references-ride-in-the-packet
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

cli-reference.md:252-253 documents `packet.references.outgoing` as `{ from, target, targetStanding, origins, rels, replacedBy }` and `incoming` as `{ from, title, standing, origins, rels }`; mcp-reference.md:517-518 repeats `origins` for kb_doctor's `reference`. kb-references/model.ts has no such field, and fc18672 removed KbReferenceOrigin with the message `there is one origin now`. The example beneath, cli-reference.md:257, prints `- decision.retention [superseded] (link, related_to)`, but where() in reassess.ts renders `rels.join(", ")` and `link` is not in KB_LINK_RELS — the real line is `(related_to)`.

## Why it matters

These two pages are the contract for the JSON surfaces; the specification page and the doctor group table were updated in the same commit range and these three lines were not. A consumer branching on `origins` to tell a prose citation from a frontmatter link gets undefined on every entry, which reads as `neither` rather than as `the field is gone`.

## Mitigation

None in the diff. Drop `origins` from both shapes and re-render the example from the code — the header, the rels in parentheses, and the replacement chain joined with an arrow.

## Verification

grep -n origins over apps/strauss-kb-docs/docs returns nothing, and the fenced example in cli-reference.md matches the output of `strauss-kb reassess` on a record with one stale related_to.

Informs [decision.reassess-references-ride-in-the-packet](decision.reassess-references-ride-in-the-packet.md).
