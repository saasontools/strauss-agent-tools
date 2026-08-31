import { describe, expect, it } from "vitest";
import { ARM_IDS, CAREFUL_INSTRUCTION, applyArm } from "./arms.js";
import { loadBundle } from "./bundle.js";
import { buildPrompt, renderBundle } from "./prompt.js";
import { TASKS } from "./tasks.js";

const records = await loadBundle();
const task = TASKS[0]!;
const fieldsOf = (arm: Parameters<typeof applyArm>[1], conceptId: string) => {
  const record = applyArm(records, arm).records.find(
    (candidate) => candidate.conceptId === conceptId,
  );
  if (!record) throw new Error(`no ${conceptId} in arm ${arm}`);
  return record;
};

describe("arm transforms", () => {
  it("shows every record in every arm, in the same order", () => {
    const orders = ARM_IDS.map((arm) =>
      applyArm(records, arm).records.map((record) => record.conceptId),
    );
    for (const order of orders) {
      expect(order).toEqual(orders[0]);
      expect(order).toHaveLength(records.length);
    }
  });

  it("arm A stubs a superseded record and names what replaced it", () => {
    const stale = fieldsOf("A", "decision.queue-backend");
    expect(stale.body).toBeNull();
    expect(stale.fields).toContainEqual(["status", "superseded"]);
    expect(stale.fields).toContainEqual([
      "superseded_by",
      "decision.jetstream-queue-backend",
    ]);
  });

  it("arm A leaves the standing record whole", () => {
    const head = fieldsOf("A", "decision.jetstream-queue-backend");
    expect(head.body).toContain("NATS JetStream");
    expect(head.fields).toContainEqual([
      "supersedes",
      "decision.queue-backend",
    ]);
  });

  it("arms B and C strip every standing field and show the stale body", () => {
    for (const arm of ["B", "C"] as const) {
      const stale = fieldsOf(arm, "decision.queue-backend");
      expect(stale.body).toContain("Amazon SQS");
      const labels = stale.fields.map(([label]) => label);
      expect(labels).not.toContain("status");
      expect(labels).not.toContain("superseded_by");
      expect(labels).not.toContain("supersedes");
      expect(labels).not.toContain("materiality");
      expect(labels).not.toContain("confidence");
      // The dates stay: an untyped note still carries when it was written,
      // and removing that would make the control weaker than the real thing.
      expect(labels).toContain("recorded");
    }
  });

  it("arm D keeps the trust fields and drops the links", () => {
    const stale = fieldsOf("D", "decision.queue-backend");
    expect(stale.body).toContain("Amazon SQS");
    expect(stale.fields).toContainEqual(["status", "superseded"]);
    expect(stale.fields.map(([label]) => label)).not.toContain("superseded_by");
    expect(
      fieldsOf("D", "decision.jetstream-queue-backend").fields.map(([l]) => l),
    ).not.toContain("supersedes");
  });

  it("arm D keeps the answered date but not the record it points at", () => {
    const resolved = fieldsOf("D", "open-question.audit-log-retention-window");
    const answered = resolved.fields.find(([label]) => label === "answered");
    expect(answered?.[1]).toBe("2026-03-19");
    const armA = fieldsOf("A", "open-question.audit-log-retention-window");
    expect(armA.fields.find(([label]) => label === "answered")?.[1]).toContain(
      "decision.audit-log-retention",
    );
  });

  it("carries the careful-reading instruction in arm B only", () => {
    expect(buildPrompt(applyArm(records, "B"), task).user).toContain(
      CAREFUL_INSTRUCTION,
    );
    for (const arm of ["A", "C", "D"] as const) {
      expect(buildPrompt(applyArm(records, arm), task).user).not.toContain(
        CAREFUL_INSTRUCTION,
      );
    }
  });

  it("never leaks a standing word into arms B and C", () => {
    for (const arm of ["B", "C"] as const) {
      const rendered = renderBundle(applyArm(records, arm));
      expect(rendered).not.toMatch(
        /superseded|strauss_status|no longer holds/i,
      );
    }
  });

  it("is byte-for-byte deterministic", () => {
    for (const arm of ARM_IDS) {
      expect(renderBundle(applyArm(records, arm))).toBe(
        renderBundle(applyArm(records, arm)),
      );
    }
  });
});
