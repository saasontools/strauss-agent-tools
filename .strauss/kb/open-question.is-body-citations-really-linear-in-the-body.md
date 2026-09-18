---
type: open-question
title: "Is bodyCitations linear in the body, as the hostile-body obligation states?"
description: "The obligation's claim rests on one input shape, backtick runs."
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-18T15:44:58.281Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
strauss_links:
  - target: test-obligation.a-hostile-body-line-costs-its-length
    rel: informs
strauss_status: resolved
strauss_owner: mcp
strauss_answered:
  by: mcp
  at: "2026-09-18T15:52:27.558Z"
---

## Question

The obligation measures only `` `x `` runs. Nested list markers and emphasis runs scale quadratically through micromark: `* ` x 4,000 costs 1.9 s, x 8,000 costs 8.3 s; and `> ` x 10,000 throws RangeError out of the recursive visit. Which shapes does 'Cost is linear in the body' cover, and what bounds the rest?

## Why it matters

validate and doctor --strict gate every review, and the obligation is the record that says a hostile body cannot stall them.

## Default assumption

The claim holds for backtick runs only; the obligation is not met for a hostile body in general.

Informs [test-obligation.a-hostile-body-line-costs-its-length](test-obligation.a-hostile-body-line-costs-its-length.md).

## Answer

No, and the default assumption was right: the obligation's claim held for backtick runs only. Measured against the built package at the head that answers this: nested list markers on one line were quadratic (`* ` x1,000 156 ms, x2,000 525 ms, x4,000 2,076 ms, x8,000 9,147 ms; `-` the same; `1.` about half); nested `> ` was linear (x20,000 350 ms); and before the explicit-stack walk, deep nesting of either overflowed the recursion.

Now: the walk is iterative, so depth costs no stack; a line opening more than 64 nested lists is refused by a one-pass scan before the parser sees it, as a named per-record warning in `validate` and an `unreadable` entry in `mirror-links`; blockquotes stay unbounded because they are linear. Multi-line nesting by indentation is bounded by body size (depth grows with the square root of the text), so it is not guarded. See test-obligation.deep-list-nesting-is-refused-before-the-parser.
