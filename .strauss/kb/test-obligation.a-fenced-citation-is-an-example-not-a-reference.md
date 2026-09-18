---
type: test-obligation
title: A link inside a fence or a code span is not a citation
description: >-
  A base whose house-style record shows how to cite would warn about itself, and
  sweep would hold a record alive on a quotation.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T19:37:52.158Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
    hash: "sha256:bee7a9a3e82dd3b568f239f5d1e121202ff79b08a8158810cab3c054687927a6"
    hash_kind: ast
    resolved_at: "2026-09-18T15:53:06.475Z"
    lines: 36
    resolver: tree-sitter
strauss_links:
  - target: risk.a-fenced-example-link-is-a-citation
    rel: satisfies
strauss_status: open
---

## Obligation

`bodyLinkTargets` strips fenced blocks and inline code spans before matching. A fence closes on a marker of its own kind and at least its own length, and an unclosed fence runs to the end of the record. Every consumer inherits it — `validate` reports no `body_link` for a fenced example, `sweep` does not hold a record quoted only inside a fence, and `doctor` raises no finding from one.

## Why it matters

The two consumers this change added act on what the parser returns rather than merely walking it: one warns about an id nobody can add, and the other keeps a terminal record alive for ever by a route no author intended.

## How to verify

`references.spec.ts` — a record whose body shows a citation inside a ```markdown fence and another inside a code span yields only the citation written in prose, and `validateBundle` reports only that one. A record whose fence is never closed yields no references at all.

Satisfies [risk.a-fenced-example-link-is-a-citation](risk.a-fenced-example-link-is-a-citation.md).
