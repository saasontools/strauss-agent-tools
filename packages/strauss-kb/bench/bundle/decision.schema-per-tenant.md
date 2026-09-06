---
type: decision
title: Each tenant gets its own Postgres schema
tags:
  - multi-tenancy
  - database
generated:
  by: meridian-platform
  at: "2026-03-05"
strauss_status: accepted
strauss_supersedes:
  - decision.tenant-isolation
strauss_confidence: medium
strauss_owner: meridian-platform
---

## Decision

Each tenant is provisioned a dedicated Postgres schema inside the shared cluster. The connection is pinned to the tenant's schema via search_path at checkout time.

## Rationale

Enterprise buyers ask for a per-tenant export and a per-tenant restore, and both are one command against a schema. Isolation is a property of the connection rather than of every query carrying its predicate correctly.

## Rejected

A separate database per tenant, which exhausts the connection budget well before the tenant count target. Row-level security, which adds planner cost to each query and leaves isolation resting on a policy nobody sees at the call site.

## Impact

Migrations fan out across schemas and run through a queued migrator. The connection pool is keyed by tenant. Schema count becomes an operational quantity to watch.
