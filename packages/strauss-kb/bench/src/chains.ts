/**
 * The fixture's supersession chains, and what each replacement may not say.
 *
 * The whole experiment rests on one property: in arms B and C, where the
 * standing fields are gone, the *only* thing separating the current record
 * from the stale one must be the reader's judgement. If a body narrates its
 * own history -- "the fixed-gap policy turned an outage into a stampede",
 * "keeping SNS for email", "services no longer verify signatures" -- then the
 * signal survives the stripping in prose, arms B and C answer correctly for a
 * reason the experiment is not testing, and the measured A-B gap collapses
 * toward zero for the wrong reason.
 *
 * A field-name regex does not catch that. The narration is semantic: it names
 * the thing being left. So each pair carries a hand-written list of the stale
 * record's distinctive tokens, and `bundle.spec.ts` asserts none of them
 * appear in the replacement's body. Hand-written and not derived, because the
 * judgement -- "SNS is the incumbent here, but Twilio legitimately returns two
 * links later in the same chain" -- is exactly what a derivation would get
 * wrong.
 */
export type SupersessionPair = {
  /** The record that no longer holds. */
  stale: string;
  /** The record that replaced it. */
  head: string;
  /**
   * Lowercased substrings distinctive to `stale`. None may appear anywhere in
   * `head`'s body -- not in its Rationale, and not in its Rejected section.
   * Naming a *generic* alternative is fine ("a managed cloud queue"); naming
   * the specific thing being left is not ("staying on SQS").
   */
  staleTokens: readonly string[];
};

export const SUPERSESSION_CHAINS: readonly SupersessionPair[] = [
  {
    stale: "decision.queue-backend",
    head: "decision.jetstream-queue-backend",
    staleTokens: ["sqs", "queue depth"],
  },
  {
    stale: "decision.access-token-format",
    head: "decision.opaque-access-tokens",
    staleTokens: ["jwt", "jwks", "local validation"],
  },
  {
    stale: "decision.tenant-isolation",
    head: "decision.schema-per-tenant",
    staleTokens: ["tenant_id", "one schema", "the orm"],
  },
  {
    stale: "decision.delivery-retry-policy",
    head: "decision.backoff-retry-policy",
    staleTokens: ["three", "fixed one-second", "failure table"],
  },
  {
    stale: "constraint.webhook-payload-cap",
    head: "constraint.large-webhook-payloads",
    staleTokens: ["256", "512 kb", "buffer pool"],
  },
  {
    stale: "decision.webhook-signature-scheme",
    head: "decision.ed25519-webhook-signatures",
    staleTokens: ["hmac", "shared secret", "sha256"],
  },
  {
    // Twilio reappears two links later, legitimately. That is why the
    // denylist is per pair rather than per chain.
    stale: "decision.notification-transport",
    head: "decision.consolidated-sns-transport",
    staleTokens: ["twilio", "sendgrid"],
  },
  {
    stale: "decision.consolidated-sns-transport",
    head: "decision.split-ses-twilio-transport",
    staleTokens: ["sns", "one vendor", "one credential"],
  },
  {
    stale: "decision.appointment-time-storage",
    head: "decision.wall-clock-time-storage",
    staleTokens: ["utc", "canonical instant"],
  },
];

/**
 * Phrases that narrate a record's own history rather than stating its content.
 *
 * A record in this bundle describes what holds, full stop. Anything that
 * positions it against a predecessor -- even innocently, even in a Rejected
 * section -- is a channel the arm transforms cannot close.
 */
export const NARRATION_PATTERNS: readonly RegExp[] = [
  /supersed/i,
  /\breplace[sd]?\b/i,
  /\breplacing\b/i,
  /\bno longer\b/i,
  /\bpreviously\b/i,
  /\bused to\b/i,
  /\bformerly\b/i,
  /\binstead of\b/i,
  /\bat the time\b/i,
  /\bgoing back\b/i,
  /\bthe earlier\b/i,
  /\bre-?opened\b/i,
  /\bkeeping\b/i,
  /\bstaying on\b/i,
  /\bagain, deliberately\b/i,
  /\bmigration as done\b/i,
];
