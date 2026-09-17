---
type: risk
title: doctor scans every record body three times in one run
description: >-
  The shared reader made each scan linear but nothing memoises it, so the cost
  rides with the base's size.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T19:11:18.351Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/doctor.ts
    symbol: orphaned
    hash: "sha256:9fdfb13f970eb8bb0041af35defaa0ac3c435f5baa0a0305508f43cc3c61e2e1"
    hash_kind: ast
    resolved_at: "2026-09-17T19:20:41.921Z"
    lines: 21
    resolver: tree-sitter
  - file: packages/strauss-kb/src/doctor.ts
    symbol: supersededButCited
    hash: "sha256:3f43b815b716c07413bac0d09718946d4cd19cb20aafad9c0b9ea334806f1ee8"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:09.173Z"
    lines: 22
    resolver: tree-sitter
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
    hash: "sha256:37fcb846d49f6a7290d64f4327669afd3e50ff59a91b825c34dc6b3cf71cb19c"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:09.178Z"
    lines: 167
    resolver: tree-sitter
strauss_links:
  - target: decision.edge-consumers-read-body-and-frontmatter
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

One `doctor` run puts the body-citation regex over every record three times: `orphaned` calls `outboundReferences` per record, `supersededButCited` reaches `staleReferences` which calls it again, and `brokenSupersession` calls `validateBundle`, whose new body-citation loop calls `bodyLinkTargets` a third time. No result is shared between the three; `staleReferences` also rebuilds a `byId` map `doctor` already holds.

## Why it matters

Measured on a synthetic bundle (bodies ~1.2 KB, two prose citations and one typed link each) against the built `dist/index.js`: one scan of every body is 0.48 ms at n=400 and 1.36 ms at n=1600, against a whole `doctor` run of 2.63 ms and 15.15 ms. Two of the three scans are redundant, about 18% of the run at n=1600. Small today at 16 records, and it grows linearly with a base that sweep now keeps more of.

## Mitigation

None taken, and none needed yet. The repair is to compute the references once per run and pass the map into the checks that need it, or to memoise `outboundReferences` on the record object. Worth doing only if a real base reaches the thousands.

## Verification

Time `doctor` on a bundle of n records with and without a memoised reference map; the difference should be about two body scans, and one body scan should stay linear in n.

Informs [decision.edge-consumers-read-body-and-frontmatter](decision.edge-consumers-read-body-and-frontmatter.md).
