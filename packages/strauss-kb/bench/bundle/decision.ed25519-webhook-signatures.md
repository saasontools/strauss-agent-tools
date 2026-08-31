---
type: decision
title: Webhooks are signed with Ed25519 detached signatures
tags:
  - webhooks
  - security
generated:
  by: meridian-notify
  at: "2026-04-28"
strauss_status: accepted
strauss_supersedes:
  - decision.webhook-signature-scheme
strauss_confidence: high
strauss_owner: meridian-notify
---

## Decision

Each outgoing webhook carries an X-Meridian-Signature header holding a detached Ed25519 signature over the raw body plus the timestamp. Public keys are published at a well-known endpoint and identified by a key id in the header.

## Rationale

A verification key that is not also a credential means a receiver leaking its configuration cannot forge events. Publishing the keys at a well-known endpoint makes rotation a fetch, which no receiver has to be told about in advance.

## Rejected

Mutual TLS, for the certificate lifecycle it pushes onto receivers. JWS with RS256, which carries a larger signature and a header format receivers kept mis-parsing.

## Impact

Receivers verify with an Ed25519 library. The key-id header enables overlapping keys during rotation, which is what the rotation test obligation covers.
