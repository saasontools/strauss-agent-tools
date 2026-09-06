---
type: test-obligation
title: No request can read another tenant's data
tags:
  - multi-tenancy
  - security
  - testing
generated:
  by: meridian-platform
  at: "2026-03-23"
strauss_status: open
strauss_materiality: blocking
strauss_owner: meridian-platform
---

## Obligation

Every read path, given a credential for tenant A and an identifier belonging to tenant B, must return not-found rather than the record.

## Why it matters

It is the invariant the whole isolation design exists to hold, and it is the one failure a customer would never forgive.

## How to verify

A generated suite walks every route in the OpenAPI document with a mismatched tenant credential and asserts not-found.
