---
type: affected-system
title: The scheduler API
tags:
  - scheduling
  - api
generated:
  by: meridian-scheduling
  at: "2026-02-26"
strauss_status: accepted
strauss_owner: meridian-scheduling
---

## System

The Fargate service serving appointment reads and writes, overlap detection, and the recurring-series generator.

## How it is affected

Time storage, tenant isolation, and the latency budget all bind here.

## Blast radius

Booking stops if it stops. It is the service the latency budget is measured on.
