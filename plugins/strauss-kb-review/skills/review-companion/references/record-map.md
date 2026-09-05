# Record map

One row per judgment the companion base carries. `kb_types` has the section
headings; `kb_schema` the write input. Every example is a `kb_write` input
unless it says `kb_write_decision`.

Tag vocabulary, all optional, all prefixed `review:` so a consumer can filter
them without guessing: `move`, `extract`, `generated`, `boilerplate`,
`security`, `performance`, `data`, `business`, `compat`. Plus the bare
`review` tag on every record that ends with the pull request.

## Risk

Something that can go wrong, on the hunk that carries it. `materiality` is
the reviewer's attention level; `confidence` is how sure you are the
mitigation holds. `verified_by` names the test that pins it, if one exists.

```json
{
  "slug": "checkout-retry-double-charge",
  "title": "A retried checkout can charge twice if the idempotency key is rotated",
  "why": "A customer pays twice; refunds are manual.",
  "sections": {
    "Risk": "The key derives from the cart hash, which changes when a line is edited mid-retry.",
    "Why it matters": "Payment provider deduplicates on the key only.",
    "Mitigation": "Key is now the order id, assigned before the first attempt.",
    "Verification": "checkout.spec.ts retries with a mutated cart and asserts one charge."
  },
  "anchors": [
    { "file": "src/checkout/pay.ts", "symbol": "PaymentClient.charge" }
  ],
  "materiality": "blocking",
  "confidence": "medium",
  "tags": ["review", "review:business"],
  "links": [
    { "target": "test-obligation.checkout-single-charge", "rel": "verified_by" }
  ]
}
```

## Missing standard

The recommendation is a `constraint` with status `proposed`; the choice you
made meanwhile is a `decision` that `informs` it. If you cannot recommend,
an `open-question` with the reviewer as `owner`.

```json
{
  "slug": "repository-retry-policy",
  "title": "Repositories retry transient DynamoDB errors three times with jitter",
  "why": "Every repository invents its own policy until one is written down.",
  "sections": {
    "Claim": "No repository catches ProvisionedThroughputExceeded itself; the base class does.",
    "Evidence": "tenant.repository.ts and order.repository.ts already disagree on count and backoff.",
    "Implication": "Existing repositories move to the base class in a follow-up."
  },
  "anchors": [
    {
      "file": "src/repositories/base.repository.ts",
      "symbol": "BaseRepository.withRetry"
    }
  ],
  "assumption": true
}
```

Written with `kb_write`, type `constraint`; the store starts it `proposed`. The
decision you took references it: `"links": [{ "target": "constraint.repository-retry-policy", "rel": "informs" }]`.

## Requirement, contract, flow you introduced

A requirement nobody gave you is `assumption: true`; one from the ticket has
the ticket as `source`. The code that meets it `satisfies` it. A
`contract` carries the compatibility story; a `flow` carries the sequence and
its failure modes.

```json
{
  "slug": "ac-3-partial-batch",
  "title": "A batch get returns the found items and lists the missing keys",
  "why": "Callers otherwise treat a partial result as a total one.",
  "sections": {
    "Claim": "AC 3 on SAA-412: missing keys are returned, not silently dropped.",
    "Evidence": "Linear issue SAA-412, acceptance criteria.",
    "Implication": "Every caller of batchGet must read `missing`."
  },
  "sources": [
    { "id": "saa-412", "resource": "https://linear.app/saason/issue/SAA-412" }
  ]
}
```

The flow that implements it:

```json
{
  "slug": "tenant-batch-get",
  "title": "Tenant lookup batches ids through MultiEntityBatchGetService",
  "why": "One round trip per hundred ids instead of one per id.",
  "sections": {
    "Flow": "Resolve ids, chunk by 100, fan out, merge, report missing.",
    "Trigger": "TenantService.findMany",
    "Steps": "chunk → batchGet → merge → missing[]",
    "Failure modes": "A chunk that throws fails the whole call; no partial retry."
  },
  "anchors": [
    {
      "file": "src/services/tenant.service.ts",
      "symbol": "TenantService.findMany"
    },
    {
      "file": "src/services/multi-entity-batch-get.service.ts",
      "symbol": "MultiEntityBatchGetService.get"
    }
  ],
  "links": [{ "target": "requirement.ac-3-partial-batch", "rel": "satisfies" }]
}
```

A reviewer walking AC 3 asks `kb_backlinks requirement.ac-3-partial-batch`
and gets every anchored flow and decision that claims to meet it.

## Move or extraction git cannot show

A `fact`: behaviour unchanged, old location named, and `verify` pointing at
the proof. Only for moves the rename detector misses — logic extracted across
files, a function inlined, a module split.

```json
{
  "slug": "chunking-extracted-from-tenant-service",
  "title": "Chunking moved from TenantService into MultiEntityBatchGetService unchanged",
  "why": "A reviewer diffing the new file sees 80 new lines that are not new.",
  "sections": {
    "Claim": "Lines 40–118 of the new service are the former TenantService.chunk, byte-identical after rename.",
    "Evidence": "git diff -M finds no rename because the enclosing file is new."
  },
  "anchors": [
    {
      "file": "src/services/multi-entity-batch-get.service.ts",
      "symbol": "MultiEntityBatchGetService.chunk"
    }
  ],
  "verify": ["pnpm vitest run src/services/tenant.service.spec.ts"],
  "tags": ["review", "review:extract"]
}
```

## Generated or boilerplate block

A `fact` that tells the reviewer how to check it instead of reading it.

```json
{
  "slug": "protocol-schemas-generated",
  "title": "desktop-protocol zod schemas are generated from protocol.yaml",
  "why": "Reviewing 600 generated lines by eye finds nothing the generator did not intend.",
  "sections": {
    "Claim": "Every file under src/protocol/generated is output of scripts/gen-protocol.ts.",
    "Evidence": "Header comment in each file names the generator and input hash."
  },
  "anchors": [{ "file": "src/protocol/generated/index.ts" }],
  "verify": [
    "pnpm gen:protocol && git diff --exit-code src/protocol/generated"
  ],
  "tags": ["review", "review:generated"]
}
```

## Test obligation

What must be verified, and whether it is. Open until the test exists; the
risk or requirement it covers is `verified_by` it.

```json
{
  "slug": "checkout-single-charge",
  "title": "A retried checkout charges exactly once",
  "why": "The double-charge risk has no other guard.",
  "sections": {
    "Obligation": "Retry with a mutated cart; assert one provider call.",
    "Why it matters": "Production cannot detect a double charge before the customer does.",
    "How to verify": "pnpm vitest run src/checkout/checkout.spec.ts -t 'charges once'"
  },
  "anchors": [{ "file": "src/checkout/checkout.spec.ts" }],
  "tags": ["review"]
}
```

Move it to `resolved` with `kb_status` when the test lands.

## Question for the reviewer

```json
{
  "slug": "retry-budget-per-tenant-or-global",
  "title": "Should the retry budget be per tenant or global?",
  "why": "Global is simpler; per tenant stops one tenant starving the rest.",
  "sections": {
    "Question": "Which scope does the budget take?",
    "Why it matters": "Changing later means a config migration.",
    "Default assumption": "Global, until a noisy tenant shows up."
  },
  "anchors": [
    { "file": "src/services/retry-budget.ts", "symbol": "RetryBudget" }
  ],
  "owner": "reviewer",
  "tags": ["review"]
}
```

The reviewer answers with `kb_answer`; the answer is appended and the
question moves to `resolved`.

## Decision

`kb_write_decision`, per recording-decisions. The one addition here: a
decision that departs from a standard names the standard in `sources` and
the departure in `alternative`, so the reviewer sees the standard was known.
