# companion-repo

A checkout service with three moving parts: `PaymentClient` charges a cart and
retries transient provider failures, `TenantService` batches tenant lookups,
and `BaseRepository` owns the store retry policy. The protocol types under
`src/protocol/generated` are generated from `src/protocol/protocol.json`; run
`pnpm gen:protocol` after editing the input rather than editing the output.

`packages/legacy-reporting` is a CSV export nobody maintains;
`.strauss/merge-policy.yaml` excludes it from review.

## Running the generator

```sh
pnpm gen:protocol
```

The generated header carries the input's sha256, so a stale output is visible
without diffing the whole file.
