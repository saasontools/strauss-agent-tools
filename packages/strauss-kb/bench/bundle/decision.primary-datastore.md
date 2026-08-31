---
type: decision
title: PostgreSQL 16 is the primary datastore
tags:
  - database
generated:
  by: meridian-platform
  at: "2025-09-02"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-platform
---

## Decision

All durable product state lives in PostgreSQL 16 on a managed cluster.

## Rationale

The workload is relational and transactional, the team has depth in it, and its full-text search removes a second system.

## Rejected

MongoDB, which would make the appointment-overlap invariants application-level. CockroachDB, whose multi-region story is not needed and whose per-statement latency was worse in the bake-off.

## Impact

Every service reaches the datastore through the shared connection layer. Extensions in use are pg_trgm and btree_gist.
