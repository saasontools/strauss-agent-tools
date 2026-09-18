---
type: risk
title: "A 12 KB record of nested blockquotes crashes validate, doctor and mirror-links"
description: >-
  One hand-edited or foreign record turns the base's health checks into a stack
  overflow.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-18T15:41:59.102Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
strauss_links:
  - target: decision.body-citations-parse-commonmark
    rel: informs
strauss_status: open
strauss_materiality: blocking
strauss_confidence: high
---

## Risk

bodyCitations walks the mdast tree with a recursive `visit`. fromMarkdown parses 12,000 nested `>` without error, but `visit` then overflows: `strauss-kb validate` and `strauss-kb doctor` on a scratch base holding one record whose body is `>` x 12000 both exit with `strauss-kb: error: Maximum call stack size exceeded`. validateBundle is called by validate and by doctor, and bodyCitations by mirror-links, so all three fail for the whole base. Before this range validate read no body and doctor matched a regex, so this is a regression.

## Why it matters

An unreadable input must degrade to a warning. Here one record takes down the checks the reviewer gate and `doctor --strict` rely on, and the error names no record.

## Mitigation

None in the diff. Walk the tree with an explicit stack instead of recursion, or catch per record and report a `body_link` warning naming the record.

## Verification

A spec feeding bodyCitations `'>'.repeat(20000) + ' [x](fact.b.md)'` returns `fact.b` and does not throw; validate on that base exits 0.

Informs [decision.body-citations-parse-commonmark](decision.body-citations-parse-commonmark.md).
