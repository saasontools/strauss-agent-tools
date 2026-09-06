---
type: open-question
title: "What uptime does the enterprise tier promise?"
tags:
  - sla
  - product
generated:
  by: meridian-commerce
  at: "2026-02-19"
strauss_status: open
strauss_materiality: blocking
strauss_owner: meridian-commerce
---

## Question

Is the contractual availability target for the enterprise tier 99.9% or 99.95%, and is the measurement window monthly or quarterly?

## Why it matters

The difference decides whether the datastore needs a synchronous standby and whether the queue needs a second region, both of which are architectural.

## Default assumption

Nothing is committed. Sales has quoted no number, and the architecture assumes neither.
