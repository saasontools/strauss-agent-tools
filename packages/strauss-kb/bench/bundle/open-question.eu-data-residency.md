---
type: open-question
title: "Must EU tenant data stay inside the EU?"
tags:
  - compliance
  - multi-tenancy
generated:
  by: meridian-platform
  at: "2026-02-05"
strauss_status: open
strauss_materiality: blocking
strauss_owner: meridian-platform
---

## Question

Do EU tenants require their appointment and patient data to be stored and processed only within the EU, or is a standard-contractual-clauses transfer acceptable for the current customer set?

## Why it matters

A residency requirement forces a second regional deployment with its own datastore, queue, and key material, which changes the tenant-provisioning path and the cost model.

## Default assumption

Nobody has confirmed this. Until legal answers, assume nothing and do not design the provisioning path around either outcome.
