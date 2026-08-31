---
type: decision
title: Search runs on PostgreSQL full-text search
tags:
  - search
  - database
generated:
  by: meridian-platform
  at: "2025-11-13"
strauss_status: accepted
strauss_confidence: medium
strauss_owner: meridian-platform
---

## Decision

Patient, practitioner, and appointment search run on PostgreSQL full-text search with a generated tsvector column and a GIN index.

## Rationale

Search is always scoped to one tenant and to at most a few hundred thousand rows, which Postgres answers inside the latency budget without a second datastore to keep in sync.

## Rejected

Elasticsearch, which adds a cluster and an indexing pipeline that can fall behind the source of truth. Typesense, which is lighter but still a second copy of tenant data to secure.

## Impact

Search quality is bounded by what tsquery expresses. Fuzzy matching comes from pg_trgm rather than an analyzer chain.
