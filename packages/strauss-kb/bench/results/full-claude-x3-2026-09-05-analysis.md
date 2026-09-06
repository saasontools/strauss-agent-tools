# Do standing fields change what an agent answers? — 3-repeat run of 2026-09-05

Companion to `full-claude-x3-2026-09-05T11-50-48-935Z.md` (tables) and `.json`
(every cell). This file is the reading; it assumes nothing beyond this
directory.

## The question

A strauss-kb record carries machine-readable standing: `strauss_status`
(accepted / superseded / rejected / open), supersession links in both
directions, and a stub in place of a superseded body. Skeptic's claim: an
untyped note plus one sentence of caution ("some of these are stale, work out
what holds") gets an agent to the same answers. This run tests that claim, and
asks every cell three times so a flipping question shows up as one.

## Setup

- **Bundle:** 51 synthesized records — 8 supersession chains (one three links
  long), 16 standing decisions with `## Rejected` sections, 5 open questions
  plus resolved controls. Record bodies never narrate their own history, so
  standing cannot leak into the arms that strip it.
- **Four arms**, same records, same order, same system prompt; only the header
  fields differ:

  | arm | what the model sees                                                                  |
  | --- | ------------------------------------------------------------------------------------ |
  | A   | standing fields + supersession links + superseded bodies replaced by a one-line stub |
  | B   | standing stripped; one sentence: some notes are stale or reversed, be careful        |
  | C   | standing stripped; nothing added                                                     |
  | D   | standing fields kept; supersession links removed                                     |

- **Thirty-one questions**: 8 current-state, 8 rejected-alternative,
  7 open-question (5 that must be refused, 2 settled controls that must not
  be), 8 aggregation. 26 are **core** — the answer is in record content every
  arm receives. 5 are **standing-only**: they ask about a field arms B/C/D
  delete, so their gap measures the deletion, not behaviour. Only core is
  headline.
- **Scoring** is code, not a judge model: a forced structured answer
  (`{answer, value, actionable, concept_ids}`) checked by regex/set rules.
- **Repeats:** 3 per cell. A cell scores the mean of its repeats; the bootstrap
  still resamples _questions_, so three answers to one question never count as
  three questions.
- **Statistic:** paired A-minus-X bootstrap (10,000 resamples of questions,
  seeded), 95% intervals.
- **Transport:** Claude Code CLI on a subscription (`claude -p`, no tools,
  structured output, thinking off — 0 thinking tokens over the run). Models
  `claude-sonnet-5` and `claude-haiku-4-5`. 744 calls, 0 errored, 53 minutes.
  Seed 20260901. List-price equivalent $3.63, billed as quota.

## Headline — core questions, A minus each control

| model            | A − B (caution sentence) | A − C (nothing)          | A − D (fields, no links) |
| ---------------- | ------------------------ | ------------------------ | ------------------------ |
| claude-sonnet-5  | +1.3pp [0, +3.8]         | **+10.3pp [+3.8, +19.2]** | 0 [−3.8, +3.8]          |
| claude-haiku-4-5 | +3.8pp [−2.6, +10.3]     | **+11.5pp [+2.6, +21.8]** | −1.3pp [−3.8, 0]        |

Per-arm core accuracy: Sonnet A 96.2%, B 94.9%, C 85.9%, D 96.2%.
Haiku A 98.7%, B 94.9%, C 87.2%, D 100%.

**Against the first run** (2026-09-03, one repeat, same 26 core questions):
Sonnet A−C was +11.5pp [0, +26.9] — same point estimate, interval now half as
wide and clear of zero; Haiku A−C was +3.8pp [−7.7, +15.4] and is now
+11.5pp [+2.6, +21.8], also clear of zero. The one-repeat run could not
distinguish "standing helps the strong model" from noise. This one can, on both
models.

## What it means

1. **Standing fields beat nothing, on both models.** A−C excludes zero for
   Sonnet and Haiku. This is the claim the format exists to support, and it is
   now a result rather than a hint. The weaker model's indifference in the first
   run was an artefact of one repeat.
2. **One sentence of caution still recovers most of it.** B sits 1.3pp
   (Sonnet) and 3.8pp (Haiku) below A on core, both intervals touching zero.
   The cheapest control does most of the work the fields do — for _answering_.
   What it does not do is make the answer stable (see stability, below).
3. **Supersession links add nothing to answering.** Sonnet A−D is exactly zero
   with a symmetric interval. Haiku's −1.3pp is one repeat of one question, not
   a signal (see the D oddity).
4. **The fields buy commitment, not knowledge.** Every core miss under B/C is
   one of two shapes: a **hedge** (correct current value, `actionable: false`,
   both the stale and the current record cited) or a **stale pick** (the
   superseded value, cited to the superseded record). Neither shape occurs in A
   or D. Current-state accuracy: Sonnet 8/8 in A, B and D, 6.7/8 in C; Haiku 8/8
   in A and D, 6.7/8 in B, 4.7/8 in C.
5. **Aggregation is where both models are weakest, and standing does not fix
   it.** The remaining aggregation misses are arithmetic, not retrieval: the
   model lists the right ids and then reports a count off by one.
6. **Standing-only questions are won by construction** (+40 to +60pp). Reported,
   not headline.

## The misses, cold

Read from the answers in the JSON. Core first, since only core is headline.

| model  | arm | core cells below 3/3                                                                                                      |
| ------ | --- | ------------------------------------------------------------------------------------------------------------------------- |
| sonnet | A   | ag-open-question-count 0/3                                                                                                |
| sonnet | B   | ag-open-question-count 0/3, ag-decision-count 2/3                                                                         |
| sonnet | C   | ag-open-question-count 0/3, ag-decision-count 2/3, ag-risk-count 2/3, cs-access-tokens 2/3, cs-queue-backend 2/3, cs-retry-policy 1/3, ra-queue-backend 1/3 |
| sonnet | D   | ag-open-question-count 1/3, ra-queue-backend 2/3                                                                          |
| haiku  | A   | ra-datastore 2/3                                                                                                          |
| haiku  | B   | cs-access-tokens 2/3, cs-retry-policy 2/3, cs-tenant-isolation 1/3                                                        |
| haiku  | C   | cs-access-tokens 1/3, cs-payload-cap 1/3, cs-queue-backend 1/3, cs-retry-policy 2/3, cs-tenant-isolation 1/3, cs-webhook-signing 2/3 |
| haiku  | D   | none — 100%                                                                                                               |

**Fixture or rubric doubt.**

- `ag-open-question-count` is still the worst cell, and the split did not fix
  it for Sonnet. The rubric expects 6 (the number of records of type
  `open-question`, five unresolved plus the resolved control). Sonnet answers
  **7 while citing exactly six ids** in all three repeats of A, B and C, and in
  two of three in D. Its own citation list contradicts its own count, so this is
  the model's arithmetic, not the question's wording — Haiku answers 6 in every
  arm and every repeat. The companion `ag-unresolved-question-count` (expects 5)
  is answered correctly by both models in A. Treat the split as successful and
  this residue as model error, but a rubric that accepted a count consistent
  with the cited set would score it differently.
- `ag-aws-services` (standing-only) is the one question the rewording did not
  rescue: Haiku fails it 0/3 even in arm A. Two repeats list a superseded
  service (SNS, RDS) alongside the current ones; the third lists the right set
  and marks it `actionable: false`. Sonnet answers it 3/3 in A. Remaining
  fixture defect, but standing-only, so it does not touch the headline.
- `ag-superseded-ids` and `ag-blocking-ids` behave as intended after the
  `concept_ids` repin: Sonnet is 3/3 on both in A, Haiku 3/3 and 2/3. Their
  B/C failures are the deletion the arm measures.

**Aggregation off-by-one (model error, no fixture change indicated).**
`ag-standing-decision-count` on Haiku lists sixteen ids and answers 17, 15 or
14 depending on the repeat (1/3 in A, 1/3 in B, 2/3 in C). `ag-decision-count`
on Sonnet answers 25 in one repeat each of B and C; `ag-risk-count` answers 3 in
one repeat of C. In every case the cited set is right and the number is not.
Standing fields have nothing to offer here.

`ra-datastore` on Haiku A (2/3) is the same class: two repeats answer the two
rejected datastores correctly, the third answers the rejected alternatives of
four unrelated decisions at once and trips the excludes check. Verbosity, not
standing.

`ra-queue-backend` on Sonnet C (1/3) and D (2/3) answers the rejected sets of
_both_ queue decisions, old and new, in one string. In C that is the arm doing
its work; in D, with the stub present, it is the model being thorough.

**The effect under test — hedges and stale picks, only under B/C.**

- **Stale picks** (answered from the superseded record and cited it): Haiku C
  `cs-queue-backend` twice ("Amazon SQS"), Haiku C `cs-access-tokens` twice
  (signed JWTs against JWKS), Haiku C `cs-tenant-isolation` twice and Haiku B
  `cs-tenant-isolation` twice (the `tenant_id` column). This is the failure the
  format exists to prevent, and it appears **only** with standing stripped —
  never once in A or D, on either model. The caution sentence does not prevent
  it: tenant isolation goes stale in B as often as in C.
- **Hedges** (right value, `actionable: false`, both records cited): Sonnet C
  on queue-backend, access-tokens and retry-policy; Haiku B on access-tokens and
  retry-policy; Haiku C on webhook-signing and payload-cap. Haiku C's retry
  policy and one payload-cap repeat go further and return an empty value. The
  model sees the conflict and refuses to resolve it. That is the honest failure
  mode, and the caution sentence produces more of it than the fields do.

## Repeat stability

29 of 248 (model, arm, question) cells did not land the same way every repeat;
mean agreement 96.1%. Every one of the 29 is a 1/3 or 2/3, so no cell is a
coin-flip disguised as a result.

Instability tracks the condition, which is itself a finding:

| arm | unstable cells |
| --- | -------------- |
| A   | 3              |
| B   | 6              |
| C   | 16             |
| D   | 4              |

Sonnet arm A is 100% stable across all 31 questions. Sonnet and Haiku arm C are
both 91.4%. Stripping standing does not only lower accuracy — it makes the
answer non-deterministic, and a knowledge base that answers differently on
Tuesday is a worse artefact than one that is merely wrong.

**What this does to the intervals.** Averaging three repeats cuts per-cell
sampling noise roughly threefold, so the per-question scores the bootstrap
resamples are less noisy. The interval _width_ is still governed by n = 26
questions, not by the repeat count — which is why A−C narrowed from ±14 points
to ±8 rather than collapsing. The narrowing is real and it is what moved A−C
clear of zero on both models.

**Noise versus genuine borderline.** Two different things sit in that table:

- _Genuine borderline_ — the cell changes shape between repeats: commits once,
  hedges once, picks the stale record once. All of `cs-access-tokens`,
  `cs-retry-policy`, `cs-tenant-isolation`, `cs-queue-backend`,
  `cs-payload-cap`, `cs-webhook-signing` under B/C are this. The model is on the
  fence and standing is what tips it. These belong in the effect.
- _Arithmetic noise_ — the cited set is identical across repeats and only the
  number moves: `ag-standing-decision-count`, `ag-decision-count`,
  `ag-risk-count`, and Sonnet D's `ag-open-question-count`. These are unrelated
  to the condition and would flicker in any arm. They inflate the spread without
  informing it.

## The D-arm oddity

Haiku D scores 100% on core against A's 98.7%, giving A−D = −1.3pp
[−3.8, 0]. The links are not hurting: **the entire gap is one repeat of one
question**. `ra-datastore` is the only Haiku core cell below 3/3 in either arm,
it is 2/3 in A and 3/3 in D, and the failing repeat is the over-broad answer
described above — nothing to do with supersession links. No Haiku core cell in
D is imperfect. Sonnet A−D is exactly zero.

Read A ≈ D, as in the first run. The honest statement remains that supersession
links do not measurably help the answer path; the negative sign here is a single
cell and the interval's upper bound is zero.

## Caveats

Unchanged from the first run:

- Synthetic bundle written to _not_ leak its own history — real bases narrate
  more, which favours the untyped arms further.
- Claude Code transport: the CLI's own scaffolding precedes the bundle, and the
  bundle is a system prompt rather than a cached user block. Numbers are
  comparable within this run only.
- Thinking was off. With thinking on, the caution sentence might close the
  remaining gap — or the model might re-derive standing from dates. Untested.
- Two models, one vendor.

What the repeats did and did not fix:

- **Did:** removed single-draw noise from every cell, made the flipping cells
  visible as flipping rather than as failures, and tightened A−C enough to clear
  zero on both models.
- **Did not:** add questions. The bootstrap still resamples 26 core questions,
  so a systematic fixture bias is exactly as present as it was — three repeats of
  a badly worded question are three repeats of a badly worded question. Widening
  the question set, not repeating it, is what buys the next interval.

## What to do with it

- **Keep standing fields and the superseded stub.** A−C now excludes zero on
  both models, on the failure the format exists to prevent, and no arm with
  standing produced a single stale pick in 186 core answers.
- **Do not sell supersession _links_ as an accuracy feature.** A ≈ D, twice
  over now. Sell them as history, `trace`, `impact` and dedup-on-write.
- **Do not oversell the caution sentence as equivalent.** It closes most of the
  accuracy gap and none of the stability gap, and it did not stop the
  tenant-isolation stale pick.
- **Remaining defects:** `ag-aws-services` still fails on Haiku in arm A —
  fix or retire it before the next run. The aggregation off-by-ones are model
  arithmetic, not fixture; leave them, or split "list the ids" from "count them"
  if the counting is not the thing being tested.
- **Both follow-up runs are still worth it, and repeats did not substitute for
  either.** An API-transport run is a genuinely different condition (cached user
  block, no CLI scaffolding) and remains unmeasured. A thinking-on run tests the
  one mechanism that could plausibly let arm B re-derive standing from dates,
  which is the skeptic's strongest remaining move.
