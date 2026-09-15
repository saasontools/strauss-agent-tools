---
type: risk
title: Per-tenant schemas may exhaust migration and catalogue budgets
tags:
  - multi-tenancy
  - database
generated:
  by: meridian-platform
  at: "2026-03-09"
strauss_status: open
strauss_materiality: blocking
strauss_owner: meridian-platform
---

## Risk

One schema per tenant multiplies catalogue entries and migration time by the tenant count, and the migration window is fixed.

## Why it matters

At the growth the plan assumes, a migration that takes a second per schema stops fitting the deployment window well before the tenant target.

## Mitigation

Migrations run through a queued migrator with bounded concurrency, and the plan is reviewed for lock class before it runs.

## Verification

A load fixture provisions a schema count matching the twelve-month projection and the migration is timed against it.
