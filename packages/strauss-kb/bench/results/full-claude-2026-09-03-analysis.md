# Do standing fields change what an agent answers? — run of 2026-09-03

Companion to `full-claude-2026-09-03T21-51-51-137Z.md` (tables) and `.json`
(every cell). This file is the reading; it assumes nothing beyond this
directory.

## The question

A strauss-kb record carries machine-readable standing: `strauss_status`
(accepted / superseded / rejected / open), supersession links in both
directions, and a stub in place of a superseded body. Skeptic's claim: an
untyped note plus one sentence of caution ("some of these are stale, work out
what holds") gets an agent to the same answers. This run tests that claim.

## Setup

- **Bundle:** 51 synthesized records — 8 supersession chains (one three links
  long), 16 standing decisions with `## Rejected` sections (24 records carry
  one), 5 open questions plus 1 resolved control. Record bodies never narrate
  their own history (a denylist forbids "supersedes", "no longer", "previously",
  and each replacement's distinctive tokens), so standing cannot leak into the
  arms that strip it.
- **Four arms**, same records, same order, same system prompt; only the header
  fields differ:

  | arm | what the model sees                                                                  |
  | --- | ------------------------------------------------------------------------------------ |
  | A   | standing fields + supersession links + superseded bodies replaced by a one-line stub |
  | B   | standing stripped; one sentence: some notes are stale or reversed, be careful        |
  | C   | standing stripped; nothing added                                                     |
  | D   | standing fields kept; supersession links removed                                     |

- **Thirty questions**: 8 current-state ("what is the queue backend?"),
  8 rejected-alternative ("why not JWT?"), 7 open-question (5 that must be
  refused as unsettled, 2 settled controls that must not be), 7 aggregation
  ("how many open questions?", "which decisions are superseded?").
  26 are **core** — the answer is in record content every arm receives.
  4 are **standing-only** — they ask about a field arms B/C/D delete, so their
  gap measures the deletion, not behaviour. Only core is headline.
- **Scoring** is code, not a judge model: a forced structured answer
  (`{answer, value, actionable, concept_ids}`) checked by regex/set rules per
  question. A refusal is judged on the refusal and the citation only.
- **Statistic:** paired A-minus-X bootstrap (10,000 resamples of _questions_,
  seeded), so between-question difficulty cancels. 95% intervals.
- **Transport:** Claude Code CLI on a subscription (`claude -p`, no tools,
  structured output, thinking disabled — 0 thinking tokens over the run).
  Models `claude-sonnet-5` and `claude-haiku-4-5`. 240 calls, 0 errored.
  The bundle sits in the system prompt, so prompt caching held (2.5M cached
  read tokens against 318k written). List-price equivalent $1.57.

## Headline — core questions, A minus each control

| model            | A − B (caution sentence) | A − C (nothing)        | A − D (fields, no links) |
| ---------------- | ------------------------ | ---------------------- | ------------------------ |
| claude-sonnet-5  | +3.8pp [0, +11.5]        | **+11.5pp [0, +26.9]** | 0                        |
| claude-haiku-4-5 | 0 [−11.5, +11.5]         | +3.8pp [−7.7, +15.4]   | 0                        |

Per-arm core accuracy: Sonnet A 96%, B 92%, C 85%, D 96%. Haiku A 96%,
B 96%, C 92%, D 96%.

## What it means

1. **Standing fields beat nothing.** Against raw untyped notes (C), the
   stronger model loses 11.5 points of core accuracy without them; the
   interval touches zero at n=26, so call it "likely, not proven". The
   weaker model is nearly indifferent.
2. **One sentence of caution recovers most of it.** B is within 4 points of A
   on Sonnet and equal on Haiku. The cheapest control does most of the work
   the fields do — for _answering_. That is the skeptic's point, and the data
   mostly grants it.
3. **Supersession links add nothing to answering.** A vs D is exactly zero on
   both models. Links earn their place elsewhere (`trace`, `impact`,
   dedup-on-write), not in the answer path.
4. **Where the fields matter is counting and confidence, not choosing.** 25 of
   28 misses are aggregation questions ("how many decisions are current?", "which ids are
   superseded?"). Current-state, rejected-alternative and the must-refuse
   open questions were at or near 100% in every arm — including C. In this
   fixture, refusing to answer an unsettled question did not depend on a
   status field; the record type and wording carried it. The four
   current-state misses (all in B/C) are three hedges and one stale pick —
   see below.
5. **Standing-only questions are won by construction** (+50 to +75pp): they
   ask for a field the control arms never received. Reported, not headline.

## The misses, cold

| model  | arm | missed                                                              |
| ------ | --- | ------------------------------------------------------------------- |
| sonnet | A   | ag-open-question-count                                              |
| sonnet | B   | 4 aggregation                                                       |
| sonnet | C   | cs-access-tokens (chose the superseded JWT design), 5 aggregation   |
| sonnet | D   | ag-open-question-count                                              |
| haiku  | A   | ag-open-question-count, ag-aws-services                             |
| haiku  | B   | cs-payload-cap, 4 aggregation                                       |
| haiku  | C   | cs-tenant-isolation, cs-payload-cap, 4 aggregation                  |
| haiku  | D   | ag-open-question-count, ag-standing-decision-count, ag-aws-services |

`ag-open-question-count` fails in six of eight cells. The rubric expects 6
(five open records plus the resolved control, all of type `open-question`);
Sonnet answers 7 in every arm and Haiku answers 5 in A and D. Neither the
fields nor the caution move it — the question is ambiguous about whether a
resolved question still counts, and that is a fixture defect to fix before the
next run.

The current-state misses are the interesting ones, and they split two ways.
Three are **hedges**: Sonnet C on access tokens and Haiku B/C on the payload
cap gave the _current_ value but marked it not actionable and cited both the
old and the new record — without a status field the model could see the
conflict and would not pick. One is a **stale pick**: Haiku C on tenant
isolation answered from the superseded design (the `tenant_id` column) and
cited it. That is the "superseded record is the older, more general one"
failure the README warns about, and it only appeared with standing stripped
and no caution.

## Caveats

- One run, 26 core questions: intervals are ±11–13 points. A second run
  would move individual cells; the ordering A ≥ D > B ≥ C is the robust part.
- Synthetic bundle written to _not_ leak — real bases narrate their history
  more, which favours the untyped arms further.
- Claude Code transport: ~900 tokens of the CLI's own scaffolding precede the
  bundle, and the bundle is a system prompt rather than a cached user block.
  Numbers are comparable within this run only; an API-transport run is a
  separate condition.
- Thinking was off. With thinking on, the caution sentence might close the
  remaining gap — or the model might re-derive standing from dates. Untested.

## What to do with it

- Keep standing fields and the superseded stub: the cost is a few tokens per
  record and the gain is real on the stronger model, on exactly the failure
  the format exists to prevent.
- Do not sell supersession _links_ as an accuracy feature; sell them as
  history and impact.
- Fix the fixture's open-question count ambiguity before the next run, then
  rerun with thinking on and over the API transport (`pnpm bench -- --full`)
  so the two conditions can be compared.
