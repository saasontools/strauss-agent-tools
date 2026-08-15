import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, redact } from "./logger.js";

const FAKE_KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12";

let written: string[];

beforeEach(() => {
  written = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  process.env.GEMINI_API_KEY = FAKE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.LOG_LEVEL;
});

describe("logger", () => {
  it("writes structured JSON lines to stderr only", () => {
    log.info("hello", { a: 1 });
    expect(written).toHaveLength(1);
    const line = JSON.parse(written[0]!);
    expect(line).toMatchObject({ level: "info", msg: "hello", a: 1 });
    expect(line.ts).toBeTruthy();
  });

  it("honours LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    log.info("suppressed");
    log.debug("suppressed");
    log.warn("kept");
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0]!).msg).toBe("kept");
  });

  it("never lets a key-shaped string reach the output", () => {
    log.error(`request failed with key ${FAKE_KEY}`, {
      detail: `x-goog-api-key: ${FAKE_KEY}`,
      nested: { apiKey: FAKE_KEY },
    });
    expect(written.join("")).not.toContain(FAKE_KEY);
    expect(written.join("")).toContain("[REDACTED]");
  });

  it("redacts the configured env key value even in odd contexts", () => {
    process.env.GEMINI_API_KEY = "plain-looking-key-value-123";
    expect(redact("oops: plain-looking-key-value-123 leaked")).not.toContain(
      "plain-looking-key-value-123",
    );
  });

  it("redacts key-value assignments generically", () => {
    expect(redact('{"api_key":"abcdefgh12345678"}')).not.toContain(
      "abcdefgh12345678",
    );
  });
});
