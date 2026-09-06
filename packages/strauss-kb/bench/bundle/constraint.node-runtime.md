---
type: constraint
title: Services run on Node 22 LTS
tags:
  - runtime
generated:
  by: meridian-platform
  at: "2025-09-02"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-platform
---

## Claim

Every service targets Node 22 LTS. Language and standard-library features newer than that runtime are not available.

## Evidence

The base image is pinned to Node 22 and CI builds and tests against it only.

## Implication

A dependency requiring a newer runtime cannot be adopted without moving the base image, which is its own change.
