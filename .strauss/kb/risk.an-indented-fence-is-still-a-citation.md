---
type: risk
title: >-
  An indented fence hides from bodyCitations, so mirror-links writes an edge
  nobody declared
description: >-
  The migration turns an example into a real related_to that then holds a record
  against sweep for ever.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T21:48:37.060Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: unmirrored
strauss_links:
  - target: decision.strauss-links-is-the-one-representation
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

prose() in body-citations.ts recognises a fence only at `^ {0,3}` and has no rule for a four-space indented code block. Reproduced against src/ with a throwaway spec: a body whose only `](id.md)` sits in a ```md fence indented six spaces under a list item returns ["fact.other"], and so does one inside a plain four-space indented block. Both are code by CommonMark. validate then reports body_link, and mirror-links' unmirrored() copies the target into strauss_links as related_to.

## Why it matters

Unlike the fenced case the previous round repaired, this one writes. A related_to the author never stated becomes a holder in sweep's holderIndex — a permanent pin, per risk.sweep-pinned-by-a-prose-citation — and a referenced id in doctor's orphaned. cli-reference.md's mirror-links section promises `A link inside a fence or a code span is an example and is left alone`, and test-obligation.a-fenced-citation-is-an-example-not-a-reference states the same guarantee without bounding it to column 0. A base whose house-style record shows how to cite inside a list item migrates itself wrong, silently.

## Mitigation

None in the diff. The repair is in prose(): carry the opening fence's indent, strip up to that many leading spaces from the lines it encloses, and skip a line indented four or more columns that is not a lazy continuation.

## Verification

A record whose only citation sits in a fence indented under a list item, and one whose only citation sits in a four-space indented block: bodyCitations returns nothing, validate reports no body_link, and `mirror-links --dry-run` lists no pending entry for it.

Informs [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).
