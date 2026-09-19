---
type: decision
title: Tenants share one schema, separated by a tenant_id column
tags:
  - multi-tenancy
  - database
generated:
  by: meridian-platform
  at: "2025-09-18"
strauss_status: superseded
strauss_superseded_by: decision.schema-per-tenant
strauss_owner: meridian-platform
---

## Decision

All tenant data lives in one Postgres schema. Every tenant-scoped table carries a tenant_id column, and the ORM adds the predicate on every query.

## Rationale

One migration runs once. Connection pooling is trivial because every connection can serve every tenant.

## Rejected

A database per tenant, which multiplies the migration and backup surface by the tenant count. Postgres row-level security, which was measured at a meaningful cost on the appointment-search path.

## Impact

A missing predicate is a cross-tenant data leak, so the ORM layer is the single enforcement point and is covered by its own test suite.
