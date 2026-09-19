---
type: decision
title: Webhooks are signed with a shared-secret HMAC
tags:
  - webhooks
  - security
generated:
  by: meridian-notify
  at: "2025-10-16"
strauss_status: superseded
strauss_superseded_by: decision.ed25519-webhook-signatures
strauss_owner: meridian-notify
---

## Decision

Each outgoing webhook carries an X-Meridian-Signature header holding an HMAC-SHA256 of the raw body under a per-tenant shared secret.

## Rationale

Every receiver ecosystem already has an HMAC verification snippet, and the secret is one value to rotate.

## Rejected

Mutual TLS, which asks a receiver to run a certificate lifecycle. Asymmetric signatures, judged as more key material than the threat justified.

## Impact

The shared secret is readable by the tenant admin in the dashboard, so it is both the verification key and a credential to protect.
