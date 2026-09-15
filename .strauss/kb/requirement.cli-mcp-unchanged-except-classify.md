---
type: requirement
title: "strauss-kb's CLI and MCP answer as before, except classify"
description: >-
  Cutting packages out of strauss-kb must not move behaviour a consumer already
  depends on.
tags:
  - review
  - "review:compat"
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:30:27.019Z"
verified: []
strauss_status: proposed
---

## Claim

Every command but classify answers byte-for-byte as before. classify changes only where a deleted rule — boilerplate shapes, rename similarity, the removed path rows — used to fire, and each fixture golden that moved is named in the commit.

## Evidence

SAA-810, Done when.

## Implication

match --git, anchor-resolve, doctor and the foreign-anchor reads keep their outputs while their git runs through git-guard.

[^saa-810]: https://linear.app/saason/issue/SAA-810
