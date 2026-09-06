---
type: decision
title: Access tokens are stateless JWTs
tags:
  - auth
  - api
generated:
  by: meridian-identity
  at: "2025-09-11"
strauss_status: superseded
strauss_superseded_by: decision.opaque-access-tokens
strauss_owner: meridian-identity
---

## Decision

The API issues signed JWT access tokens carrying the tenant id, the subject, and the scope set. Services validate them locally against the published JWKS.

## Rationale

Local validation keeps the hot path free of a network hop, and every service already parses the same claim set.

## Rejected

Opaque tokens with a central introspection endpoint, which puts the identity service on the critical path of every request. PASETO, which nothing in the client SDK ecosystem speaks.

## Impact

Token lifetime is fifteen minutes because there is no way to revoke one early. Every service links the JWT verification middleware.
