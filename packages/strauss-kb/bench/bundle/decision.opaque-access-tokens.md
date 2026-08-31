---
type: decision
title: Access tokens are opaque handles resolved against the session store
tags:
  - auth
  - api
generated:
  by: meridian-identity
  at: "2026-01-22"
strauss_status: accepted
strauss_supersedes:
  - decision.access-token-format
strauss_confidence: high
strauss_owner: meridian-identity
---

## Decision

The API issues opaque 32-byte random access tokens. The edge gateway resolves a token against the Redis-backed session store once per request and forwards the resolved identity to services as signed internal headers.

## Rationale

Immediate revocation is a contractual requirement for the enterprise tier, and the tenant-offboarding flow needs a token to stop working the moment an admin clicks revoke. Resolution happens once at the edge, so the per-service cost is a header read.

## Rejected

Stateless tokens carrying their own claims plus a revocation bloom filter, which is eventually consistent in exactly the window that matters. Signed cookies, which do not work for the server-to-server integrations.

## Impact

Services trust the gateway's internal headers and do no cryptographic work of their own. The session store sits on the critical path and is replicated across two availability zones.
