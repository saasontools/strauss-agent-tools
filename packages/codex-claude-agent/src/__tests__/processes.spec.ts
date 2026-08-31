import { describe, expect, it } from "vitest";

import { probeProcessIdentity } from "../jobs/processes.js";

describe("probeProcessIdentity", () => {
  it("identifies a live process — this one", async () => {
    const probe = await probeProcessIdentity(process.pid);

    expect(probe.identity).toBeTruthy();
    expect(probe.reason).toBeUndefined();
  });

  it("explains itself when there is no such process", async () => {
    // A run aborts with E_EXECUTION when this comes back empty, so the reason
    // is the only thing standing between a CI failure and a diagnosis.
    const probe = await probeProcessIdentity(0x7ffffff0);

    expect(probe.identity).toBeUndefined();
    expect(probe.reason).toBeTruthy();
  });
});
