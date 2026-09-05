---
type: decision
title: The tenant dashboard is built with SvelteKit
tags:
  - frontend
generated:
  by: meridian-web
  at: "2026-01-15"
strauss_status: accepted
strauss_confidence: medium
strauss_owner: meridian-web
---

## Decision

The tenant-facing dashboard is a SvelteKit application rendered on the server and hydrated on the client.

## Rationale

The dashboard is form-heavy and latency-sensitive on modest clinic hardware, and the shipped bundle is materially smaller than the alternatives measured.

## Rejected

Next.js, which shipped roughly twice the JavaScript for the same screens in the prototype. Remix, which measured close to SvelteKit but has no in-house experience behind it.

## Impact

The dashboard deploys as its own Fargate service. Shared types come from the generated OpenAPI client.
