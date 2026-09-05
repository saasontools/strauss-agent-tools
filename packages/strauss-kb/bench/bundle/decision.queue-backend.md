---
type: decision
title: Amazon SQS carries the background job queue
tags:
  - queue
  - infrastructure
generated:
  by: meridian-platform
  at: "2025-09-04"
strauss_status: superseded
strauss_superseded_by: decision.jetstream-queue-backend
strauss_owner: meridian-platform
---

## Decision

Background jobs -- reminder fan-out, webhook delivery, nightly billing rollups -- are enqueued on Amazon SQS standard queues, one queue per job family.

## Rationale

SQS is already in the account, needs no operational care, and the at-least-once delivery it offers matches what the workers were written to tolerate.

## Rejected

Kafka, which brings a cluster to run for a workload measured in thousands of messages a minute. RabbitMQ, for the same reason plus a failover story nobody on the team had run before.

## Impact

The notification worker and the webhook dispatcher both take an SQS client. Queue depth is the primary saturation signal in the dashboards.
