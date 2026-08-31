---
type: open-question
title: "Which push provider will the mobile app use?"
tags:
  - notifications
  - mobile
generated:
  by: meridian-notify
  at: "2026-04-02"
strauss_status: open
strauss_materiality: important
strauss_owner: meridian-notify
---

## Question

Does the mobile app deliver reminders through Firebase Cloud Messaging, through APNs and FCM directly, or through a provider that abstracts both?

## Why it matters

It decides whether the notification worker grows a third channel with its own token lifecycle, and whether device tokens become tenant data with a residency question attached.

## Default assumption

Open. The mobile app has no reminder delivery path yet.
