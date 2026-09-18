---
type: risk
title: >-
  A 20 KB record body crashes validate, doctor and mirror-links, and the author
  gate reads the crash as a clean base
description: >-
  bodyCitations is new on the validate path, and a body is text any actor
  writes.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-18T15:44:50.074Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
strauss_links:
  - target: decision.body-citations-parse-commonmark
    rel: informs
  - target: test-obligation.a-hostile-body-line-costs-its-length
    rel: informs
strauss_status: open
strauss_materiality: blocking
strauss_confidence: high
---

## Risk

bodyCitations walks the mdast tree with a recursive `visit`, uncaught. A body of 10,000 `> ` (20 KB) throws RangeError: Maximum call stack size exceeded; so does 10,000 `* `. validateBundle calls it for every record and doctor calls validateBundle, so `strauss-kb validate`, `doctor --strict` and `mirror-links --dry-run` all exit 1 with that message for the whole base. Separately, micromark is quadratic on nested list markers and emphasis runs: `* ` x 8,000 (16 KB) costs 8.3 s, x 4,000 costs 1.9 s; `*` x 8,000 each side costs 2.0 s. validate and doctor each pay it.

## Why it matters

The author Stop gate builds its context with `json(kb, ["validate"]) ?? []` and `json(kb, ["doctor", ...]) ?? { groups: [] }` (plugins/strauss-kb-review/hooks/scripts/lib/context.mjs), so a crash or a timeout reads as no validate errors and no doctor findings: one hostile record switches off store.validate and store.expired for every record. The reviewer preflight fails closed (non-zero exit is unvalidated-base), so reviewers stop writing instead: a contributed record silences the review. The MCP kb_validate and kb_doctor fail the same way.

## Mitigation

None in the diff. Walk iteratively (or catch per record and report a `body_link` problem), cap the body length parsed, and have context.mjs treat a failed validate or doctor as a blocking finding, not an empty list.

## Verification

Scratch base, dist built at HEAD: risk.bad with an unknown rel plus risk.hostile with `> ` x 10,000. `strauss-kb validate` exit 1, stderr `strauss-kb: error: Maximum call stack size exceeded`, stdout empty; without risk.hostile it prints the link_rel error. `doctor --json --strict` and `mirror-links --dry-run` fail identically. Timings from bodyCitations imported from dist/index.js.

Informs [decision.body-citations-parse-commonmark](decision.body-citations-parse-commonmark.md).

Informs [test-obligation.a-hostile-body-line-costs-its-length](test-obligation.a-hostile-body-line-costs-its-length.md).
