# Write-back shapes

One `strauss-kb` command per row of the skill's write table. `<name>` is your
agent name; `--bundle` defaults to `.strauss/kb`.

## Risk the author did not record

```bash
STRAUSS_KB_ACTOR=agent:security strauss-kb write risk <<'JSON'
{
  "slug": "token-reuse-across-tenants",
  "title": "A refresh token issued for one tenant is accepted by another",
  "why": "Cross-tenant session takeover.",
  "sections": {
    "Risk": "The token claims carry no tenant id; validation checks signature only.",
    "Why it matters": "Any tenant's user can act in another tenant.",
    "Mitigation": "None in the diff.",
    "Verification": "None."
  },
  "anchors": [{ "file": "src/auth/refresh.ts", "symbol": "validateRefresh" }],
  "materiality": "blocking",
  "confidence": "high",
  "tags": ["review", "review:security"]
}
JSON
```

`materiality: blocking` needs `mayBlock: true` on your roster entry.

## Claim checked and holding

```bash
STRAUSS_KB_ACTOR=agent:security strauss-kb verify decision.cas-not-lock \
  --note "Re-read KbStore.setStatus; the digest check runs before publish."
```

The note says what you read, not that you agree. A record's own writer cannot
verify it.

## Dispute or refutation

```bash
STRAUSS_KB_ACTOR=agent:security strauss-kb write open-question <<'JSON'
{
  "slug": "cache-invalidation-on-write",
  "title": "Does the tenant cache invalidate on write, as decision.tenant-cache-ttl says?",
  "why": "The decision's mitigation rests on it.",
  "sections": {
    "Question": "TenantCache.set never calls invalidate; where does the write path clear the entry?",
    "Why it matters": "A stale entry serves another tenant's config for the TTL.",
    "Default assumption": "It does not invalidate; the record's mitigation is treated as absent."
  },
  "anchors": [{ "file": "src/cache/tenant.ts", "symbol": "TenantCache.set" }],
  "owner": "agent:author",
  "tags": ["review", "review:security"],
  "links": [{ "target": "decision.tenant-cache-ttl", "rel": "informs" }]
}
JSON
```

`owner` is the actor that wrote the disputed record: `strauss-kb log` names it.

## Anchor moved, content intact

```bash
STRAUSS_KB_ACTOR=agent:security strauss-kb anchor-resolve decision.cas-not-lock --rebaseline
```

Only when the drift is a move. Changed content is a dispute, not a rebaseline.

## Report block

```json
{
  "actor": "agent:security",
  "sha": "d1135cbf0c6d4b7e9a2f1e8c3b5a7d9e0f1a2b3c",
  "records": {
    "decision.cas-not-lock": {
      "verdict": "verified",
      "note": "digest check before publish"
    },
    "decision.tenant-cache-ttl": {
      "verdict": "disputed",
      "note": "no invalidate on write"
    }
  },
  "written": [
    {
      "op": "write",
      "type": "risk",
      "conceptId": "risk.token-reuse-across-tenants"
    },
    { "op": "verify", "conceptId": "decision.cas-not-lock" },
    {
      "op": "write",
      "type": "open-question",
      "conceptId": "open-question.cache-invalidation-on-write"
    }
  ],
  "risks": {
    "risk.token-reuse-across-tenants": {
      "settle": "open",
      "reason": "fixed in a1b2c3d, but the key is still read before the tenant check"
    }
  },
  "partial": false,
  "reason": null
}
```

`verdict` is `verified | disputed | lies | unverified`; `op` is
`write | verify | rebaseline`; `type` only on `write`; `risks` only on a
rerun, `settle` is `close | open`; `reason` is `budget | unvalidated-base | null`.
