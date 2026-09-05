---
type: decision
title: The public API is REST over HTTP with JSON
tags:
  - api
generated:
  by: meridian-platform
  at: "2025-09-08"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-platform
---

## Decision

The public API is resource-oriented REST over HTTP/1.1 with JSON bodies, described by an OpenAPI 3.1 document.

## Rationale

Integrators are clinic software vendors whose toolchains speak HTTP and JSON, and OpenAPI gives them generated clients without a new runtime.

## Rejected

gRPC, which needs a proxy for browsers and a toolchain most integrators do not have. GraphQL, whose per-query cost model does not fit a public surface with untrusted callers.

## Impact

The OpenAPI document is generated from the route definitions and is the published contract.
