import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@google/genai";
import {
  AUTH_HELP,
  GeminiError,
  mapError,
  startResearch,
  resetClient,
} from "./gemini.js";

const FAKE_KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  resetClient();
});

describe("mapError", () => {
  it("maps 401/403 to the auth help message without leaking the key", () => {
    process.env.GEMINI_API_KEY = FAKE_KEY;
    for (const status of [401, 403]) {
      const mapped = mapError(
        new ApiError({ message: `denied for key ${FAKE_KEY}`, status }),
        "start",
      );
      expect(mapped.kind).toBe("auth");
      expect(mapped.message).toBe(AUTH_HELP);
      expect(mapped.message).not.toContain(FAKE_KEY);
    }
  });

  it("maps 429 to rate-limited with retry-after and a not-started note", () => {
    const mapped = mapError(
      new ApiError({ message: "quota exceeded, retry after 12s", status: 429 }),
      "start",
    );
    expect(mapped.kind).toBe("rate_limited");
    expect(mapped.message).toContain("NOT started");
    expect(mapped.message).toContain("12");
  });

  it("maps 400 to bad request naming the valid agents", () => {
    const mapped = mapError(
      new ApiError({ message: "unknown agent", status: 400 }),
      "start",
    );
    expect(mapped.kind).toBe("bad_request");
    expect(mapped.message).toContain("deep-research-preview-04-2026");
    expect(mapped.message).toContain("deep-research-max-preview-04-2026");
  });

  it("distinguishes unreachable-API from research failure", () => {
    const mapped = mapError(new TypeError("fetch failed"), "status");
    expect(mapped.kind).toBe("unreachable");
    expect(mapped.message).toContain("did not fail");
  });

  it("redacts key material from passthrough API errors", () => {
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const mapped = mapError(
      new ApiError({ message: `server error ${FAKE_KEY}`, status: 500 }),
      "start",
    );
    expect(mapped.kind).toBe("api");
    expect(mapped.message).not.toContain(FAKE_KEY);
  });

  it("passes GeminiError through unchanged", () => {
    const original = new GeminiError("x", "auth");
    expect(mapError(original, "start")).toBe(original);
  });
});

describe("startResearch auth gate", () => {
  it("fails with the auth message when no key is configured", async () => {
    await expect(
      startResearch({ query: "q", depth: "standard" }),
    ).rejects.toMatchObject({ kind: "auth", message: AUTH_HELP });
  });
});
