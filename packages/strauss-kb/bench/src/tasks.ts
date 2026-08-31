import type { BenchTask } from "./model.js";

/**
 * Thirty questions over the shipped bundle, with ground truth per question.
 *
 * Written against the bundle's actual content, in four families:
 *
 * - `current-state` -- a superseded record and its replacement both exist, and
 *   acting on the superseded one is the failure the standing fields claim to
 *   prevent.
 * - `rejected-alternative` -- the answer is inside a standing record's
 *   `## Rejected` section. Standing should not help here; this family is the
 *   floor that says the arms are otherwise comparable.
 * - `open-question` -- five that must be refused and two settled controls that
 *   must not be, so an arm cannot win by refusing everything.
 * - `aggregation` -- counting or listing across the whole bundle.
 *
 * Rubric patterns are deliberately loose on wording and tight on the token
 * that separates the current answer from the stale one.
 */
export const TASKS: readonly BenchTask[] = [
  // ---------------------------------------------------------------- current
  {
    id: "cs-queue-backend",
    type: "current-state",
    question:
      "I am adding a new background job family for insurance-claim submission. Which queue technology should I write the new worker against?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["nats|jetstream"],
      valueExcludes: ["\\bsqs\\b|simple queue service"],
      citeAll: ["decision.jetstream-queue-backend"],
    },
  },
  {
    id: "cs-access-tokens",
    type: "current-state",
    question:
      "A new internal service has to authenticate incoming API requests. What form does an access token take, and how does the service establish who the caller is?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["opaque|session store|gateway|internal header"],
      valueExcludes: ["\\bjwt\\b|json web token|jwks"],
      citeAll: ["decision.opaque-access-tokens"],
    },
  },
  {
    id: "cs-tenant-isolation",
    type: "current-state",
    question:
      "I am writing the query layer for a new tenant-scoped table. How is one tenant's data kept separate from another's?",
    rubric: {
      expectActionable: true,
      valueIncludes: [
        "per[- ]tenant schema|schema per tenant|dedicated .*schema|own .*schema|separate schema|search_path",
      ],
      valueExcludes: ["tenant_id|shared schema"],
      citeAll: ["decision.schema-per-tenant"],
    },
  },
  {
    id: "cs-retry-policy",
    type: "current-state",
    question:
      "How many times is a failed webhook delivery retried, and how are the attempts spaced?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["\\bfive\\b|\\b5\\b", "backoff|exponential"],
      valueExcludes: ["\\bthree\\b|\\b3 (retries|attempts|times)"],
      citeAll: ["decision.backoff-retry-policy"],
    },
  },
  {
    id: "cs-payload-cap",
    type: "current-state",
    question:
      "What is the largest webhook payload the platform will send before it truncates and swaps in a fetch URL?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["1\\s?mb|1[.,]?0?\\s?mb|1024\\s?kb|1,024\\s?kb"],
      valueExcludes: ["256"],
      citeAll: ["constraint.large-webhook-payloads"],
    },
  },
  {
    id: "cs-webhook-signing",
    type: "current-state",
    question:
      "I am writing the integration guide section on verifying webhook signatures. What signature scheme do receivers verify against?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["ed25519"],
      valueExcludes: ["hmac"],
      citeAll: ["decision.ed25519-webhook-signatures"],
    },
  },
  {
    id: "cs-notification-transport",
    type: "current-state",
    question: "Which providers carry outbound email and outbound SMS today?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["\\bses\\b|simple email service", "twilio"],
      valueExcludes: ["\\bsns\\b|sendgrid"],
      citeAll: ["decision.split-ses-twilio-transport"],
    },
  },
  {
    id: "cs-time-storage",
    type: "current-state",
    question:
      "When the scheduler persists a new appointment, what exactly goes into the time columns?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["wall[- ]?clock|local (date-?)?time", "zone|iana|tz"],
      citeAll: ["decision.wall-clock-time-storage"],
    },
  },

  // ------------------------------------------------------ rejected options
  {
    id: "ra-queue-backend",
    type: "rejected-alternative",
    question:
      "Somebody is about to re-propose Kafka for the job queue. Which alternatives were explicitly considered and rejected when the current queue technology was chosen?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["kafka"],
      valueExcludes: ["\\bnats\\b|jetstream"],
      citeAll: ["decision.jetstream-queue-backend"],
    },
  },
  {
    id: "ra-datastore",
    type: "rejected-alternative",
    question:
      "Which datastores were considered and rejected in favour of the one the project uses?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["mongo", "cockroach"],
      valueExcludes: ["postgres"],
      citeAll: ["decision.primary-datastore"],
    },
  },
  {
    id: "ra-api-protocol",
    type: "rejected-alternative",
    question:
      "Which API protocols were considered and rejected for the public API?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["grpc", "graphql"],
      valueExcludes: ["\\brest\\b"],
      citeAll: ["decision.public-api-protocol"],
    },
  },
  {
    id: "ra-deployment",
    type: "rejected-alternative",
    question:
      "Which deployment targets were considered and rejected for running the services?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["kubernetes|eks", "ec2"],
      valueExcludes: ["fargate"],
      citeAll: ["decision.deployment-target"],
    },
  },
  {
    id: "ra-search",
    type: "rejected-alternative",
    question:
      "Which search backends were considered and rejected before the current one was chosen?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["elasticsearch", "typesense"],
      citeAll: ["decision.search-backend"],
    },
  },
  {
    id: "ra-billing",
    type: "rejected-alternative",
    question:
      "Which billing options were considered and rejected for subscription billing?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["chargebee", "in[- ]?house|build.*ourselves|internal"],
      valueExcludes: ["stripe"],
      citeAll: ["decision.billing-provider"],
    },
  },
  {
    id: "ra-observability",
    type: "rejected-alternative",
    question:
      "Which observability options were considered and rejected for the telemetry stack?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["datadog", "prometheus"],
      valueExcludes: ["grafana cloud"],
      citeAll: ["decision.observability-stack"],
    },
  },
  {
    id: "ra-frontend",
    type: "rejected-alternative",
    question:
      "Which frontend frameworks were considered and rejected for the tenant dashboard?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["next\\.?js", "remix"],
      valueExcludes: ["sveltekit"],
      citeAll: ["decision.frontend-framework"],
    },
  },

  // ------------------------------------------------------- open questions
  {
    id: "oq-eu-residency",
    type: "open-question",
    question:
      "A German customer's procurement team asks whether their patient data stays inside the EU. What does the project commit to, and can I answer them from these notes?",
    rubric: {
      expectActionable: false,
      citeAll: ["open-question.eu-data-residency"],
    },
  },
  {
    id: "oq-byo-smtp",
    type: "open-question",
    question:
      "Should I build the configuration screen that lets a tenant point outbound email at their own SMTP relay?",
    rubric: {
      expectActionable: false,
      citeAll: ["open-question.byo-smtp"],
    },
  },
  {
    id: "oq-sla",
    type: "open-question",
    question:
      "I am writing the enterprise contract's availability clause. What uptime does the enterprise tier promise?",
    rubric: {
      expectActionable: false,
      citeAll: ["open-question.uptime-sla-target"],
    },
  },
  {
    id: "oq-free-tier",
    type: "open-question",
    question:
      "I need to implement the free-tier limit check. Which quantity does it compare against?",
    rubric: {
      expectActionable: false,
      citeAll: ["open-question.free-tier-cutoff"],
    },
  },
  {
    id: "oq-push-provider",
    type: "open-question",
    question:
      "I am adding push delivery to the notification worker. Which push provider does it integrate with?",
    rubric: {
      expectActionable: false,
      citeAll: ["open-question.mobile-push-provider"],
    },
  },
  {
    id: "oq-audit-retention-settled",
    type: "open-question",
    question:
      "I am implementing the nightly audit-log expiry job. How long are audit log entries kept?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["400"],
      citeAll: ["decision.audit-log-retention"],
    },
  },
  {
    id: "oq-node-runtime-settled",
    type: "open-question",
    question:
      "A dependency I want requires a newer JavaScript runtime. Which Node.js version do the services target?",
    rubric: {
      expectActionable: true,
      valueIncludes: ["22"],
      citeAll: ["constraint.node-runtime"],
    },
  },

  // ---------------------------------------------------------- aggregation
  {
    id: "ag-superseded-ids",
    type: "aggregation",
    question:
      "List the ids of every note here that no longer holds because a later note replaced it. Put the ids in concept_ids and a count in value.",
    rubric: {
      expectActionable: true,
      conceptIdsEqual: [
        "constraint.webhook-payload-cap",
        "decision.access-token-format",
        "decision.appointment-time-storage",
        "decision.consolidated-sns-transport",
        "decision.delivery-retry-policy",
        "decision.notification-transport",
        "decision.queue-backend",
        "decision.tenant-isolation",
        "decision.webhook-signature-scheme",
      ],
    },
  },
  {
    id: "ag-open-question-count",
    type: "aggregation",
    question:
      "How many questions in these notes are still unanswered? Put the number in value.",
    rubric: { expectActionable: true, numericValue: 5 },
  },
  {
    id: "ag-aws-services",
    type: "aggregation",
    question:
      "Which named AWS services does the architecture the project runs on today depend on? List them in value.",
    rubric: {
      expectActionable: true,
      valueIncludes: ["ecs|fargate", "\\bses\\b|simple email service"],
      valueExcludes: ["\\bsqs\\b", "\\bsns\\b"],
    },
  },
  {
    id: "ag-blocking-ids",
    type: "aggregation",
    question:
      "List the ids of every note flagged as blocking. Put the ids in concept_ids and a count in value.",
    rubric: {
      expectActionable: true,
      conceptIdsEqual: [
        "open-question.eu-data-residency",
        "open-question.uptime-sla-target",
        "risk.tenant-schema-sprawl",
        "test-obligation.cross-tenant-read",
      ],
    },
  },
  {
    id: "ag-risk-count",
    type: "aggregation",
    question:
      "How many risks are recorded in these notes? Put the number in value.",
    rubric: { expectActionable: true, numericValue: 4 },
  },
  {
    id: "ag-standing-decision-count",
    type: "aggregation",
    question:
      "Counting only the decisions that still hold, how many decision notes are there? Put the number in value.",
    rubric: { expectActionable: true, numericValue: 16 },
  },
  {
    id: "ag-open-test-obligations",
    type: "aggregation",
    question:
      "List the ids of every test obligation that is still outstanding. Put the ids in concept_ids and a count in value.",
    rubric: {
      expectActionable: true,
      conceptIdsEqual: [
        "test-obligation.cross-tenant-read",
        "test-obligation.webhook-key-rotation",
      ],
    },
  },
];

/** The first `n` tasks, spread across all four types -- what a smoke run uses. */
export function sampleTasks(
  n: number,
  tasks: readonly BenchTask[] = TASKS,
): BenchTask[] {
  const byType = new Map<string, BenchTask[]>();
  for (const task of tasks) {
    const bucket = byType.get(task.type) ?? [];
    bucket.push(task);
    byType.set(task.type, bucket);
  }
  const picked: BenchTask[] = [];
  let round = 0;
  while (picked.length < n && round < tasks.length) {
    for (const bucket of byType.values()) {
      const task = bucket[round];
      if (task && picked.length < n) picked.push(task);
    }
    round += 1;
  }
  return picked;
}
