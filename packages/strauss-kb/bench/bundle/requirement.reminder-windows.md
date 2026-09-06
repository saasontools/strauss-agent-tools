---
type: requirement
title: Reminders go out 24 hours and 1 hour before an appointment
tags:
  - notifications
  - scheduling
generated:
  by: meridian-scheduling
  at: "2025-10-30"
strauss_status: proposed
strauss_materiality: important
strauss_owner: meridian-scheduling
---

## Claim

Each appointment generates two reminders: one 24 hours before and one 1 hour before, in the patient's preferred channel.

## Evidence

The two-reminder pattern is what the pilot clinics ran manually, and it is the schedule their no-show figures were measured against.

## Implication

Reminder scheduling depends on the stored appointment time, so a change to time storage changes when reminders fire.
