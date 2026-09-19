---
type: decision
title: Schema migrations are managed with Atlas
tags:
  - database
  - tooling
generated:
  by: meridian-platform
  at: "2026-01-08"
strauss_status: accepted
strauss_confidence: medium
strauss_owner: meridian-platform
---

## Decision

Schema changes are authored as a declarative desired state and applied with Atlas, which plans and versions the migration.

## Rationale

The per-tenant schema fan-out needs a planner that can diff a target state against many schemas, and Atlas produces a reviewable plan before anything runs.

## Rejected

Flyway, whose imperative scripts must be written correctly once per fan-out shape. Liquibase, for the same reason plus an XML changelog nobody wanted to review.

## Impact

The desired state is checked in. CI fails on a plan that would take a lock the deployment window cannot afford.
