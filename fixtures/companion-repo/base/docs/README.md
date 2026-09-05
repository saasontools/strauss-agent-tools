# companion-repo

A checkout service with three moving parts: `PaymentClient` charges a cart and
retries transient provider failures, `TenantService` batches tenant lookups,
and `BaseRepository` owns the store retry policy. The protocol types under
`src/protocol/generated` are generated from `src/protocol/protocol.json`.

`packages/legacy-reporting` is a CSV export nobody maintains;
`.strauss/merge-policy.json` excludes it from review.
