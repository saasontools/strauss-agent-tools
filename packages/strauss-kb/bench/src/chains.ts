/**
 * The fixture's supersession chains, and what each replacement may not say.
 *
 * In arms B and C the only thing separating the current record from the stale
 * one must be the reader's judgement, so a body that narrates its own history
 * leaks the standing signal in prose. The narration is semantic and a
 * field-name regex cannot see it, so each pair carries a hand-written list of
 * the stale record's distinctive tokens and `bundle.spec.ts` asserts none of
 * them appear in the replacement's body. Hand-written, because a derivation
 * would flag Twilio's legitimate return two links later in the same chain.
 */
export type SupersessionPair = {
  /** The record that no longer holds. */
  stale: string;
  /** The record that replaced it. */
  head: string;
  /**
   * Lowercased substrings distinctive to `stale`. None may appear anywhere in
   * `head`'s body. Naming a *generic* alternative is fine ("a managed cloud
   * queue"); naming the specific thing being left is not ("staying on SQS").
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
 * Anything positioning a record against a predecessor -- even in a Rejected
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
