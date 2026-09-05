---
type: decision
title: Audit log entries are retained for 400 days
tags:
  - audit
  - compliance
generated:
  by: meridian-identity
  at: "2026-03-19"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-identity
---

## Decision

Audit log entries are retained for 400 days, then deleted by a nightly job. Tenants on the enterprise tier can export the log before expiry.

## Rationale

400 days covers a full annual audit cycle plus the lag between the period ending and an auditor asking, which is the window customers actually requested.

## Rejected

Seven years, which is a records-retention rule for financial books and not for access logs, and which would dominate storage cost. Ninety days, which does not reach back to the previous annual cycle.

## Impact

The audit table is partitioned by month so expiry is a partition drop. Export is a per-tenant job.
