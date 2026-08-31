---
type: decision
title: Telemetry is OpenTelemetry exported to Grafana Cloud
tags:
  - observability
generated:
  by: meridian-platform
  at: "2025-12-10"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-platform
---

## Decision

Services emit OpenTelemetry traces, metrics, and logs through a collector sidecar to Grafana Cloud.

## Rationale

The instrumentation is vendor-neutral, so the destination stays a configuration change, and the bill scales with retention rather than host count.

## Rejected

Datadog, whose per-host pricing sits badly against a Fargate fleet that scales to zero overnight. Self-hosted Prometheus and Loki, which is another cluster for the same team of four to operate.

## Impact

Every service links the OTel SDK. Trace context propagates through the queue via message headers.
