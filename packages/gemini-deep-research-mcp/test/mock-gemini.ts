import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal mock of the Gemini Interactions API, driven by canned payloads.
 * Paths were derived empirically from @google/genai 2.17.1:
 *   POST /v1beta/interactions            -> create
 *   GET  /v1beta/interactions/:id        -> get
 *   POST /v1beta/interactions/:id/cancel -> cancel
 */

export interface MockInteractionPayload {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface MockErrorPayload {
  httpStatus: number;
  message: string;
}

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
}

function isError(
  value: MockInteractionPayload | MockErrorPayload,
): value is MockErrorPayload {
  return "httpStatus" in value;
}

export class MockGemini {
  private server: Server | undefined;
  url = "";
  requests: RecordedRequest[] = [];
  /** Responses for successive POST /interactions calls (shifted; required). */
  createQueue: Array<MockInteractionPayload | MockErrorPayload> = [];
  /** Per-interaction timeline for successive GETs; the last entry repeats. */
  private timelines = new Map<string, MockInteractionPayload[]>();
  /** Optional override for cancel responses. */
  cancelResponse: MockInteractionPayload | undefined;

  setTimeline(id: string, states: MockInteractionPayload[]): void {
    this.timelines.set(id, [...states]);
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = raw ? (JSON.parse(raw) as unknown) : undefined;
        this.requests.push({
          method: req.method ?? "",
          url: req.url ?? "",
          body,
        });
        res.setHeader("content-type", "application/json");

        const url = req.url ?? "";
        const respond = (status: number, payload: object): void => {
          res.statusCode = status;
          res.end(JSON.stringify(payload));
        };

        const cancelMatch = /^\/v1beta\/interactions\/([^/?]+)\/cancel/.exec(
          url,
        );
        const getMatch = /^\/v1beta\/interactions\/([^/?]+)(\?|$)/.exec(url);

        if (
          req.method === "POST" &&
          url.startsWith("/v1beta/interactions") &&
          !cancelMatch
        ) {
          // A sole error entry stays queued: the SDK retries 429/5xx
          // internally and every retry must see the same failure.
          const head = this.createQueue[0];
          const next =
            head && isError(head) && this.createQueue.length === 1
              ? head
              : this.createQueue.shift();
          if (!next) {
            return respond(500, {
              error: { message: "mock: unexpected create call", code: 500 },
            });
          }
          if (isError(next)) {
            return respond(next.httpStatus, {
              error: { message: next.message, code: next.httpStatus },
            });
          }
          return respond(200, next);
        }

        if (req.method === "POST" && cancelMatch) {
          const id = cancelMatch[1]!;
          const payload =
            this.cancelResponse ?? ({ id, status: "cancelled" } as const);
          this.setTimeline(id, [payload]);
          return respond(200, payload);
        }

        if (req.method === "GET" && getMatch) {
          const timeline = this.timelines.get(getMatch[1]!);
          if (!timeline?.length) {
            return respond(404, {
              error: {
                message: `mock: unknown interaction ${getMatch[1]}`,
                code: 404,
              },
            });
          }
          const state = timeline.length > 1 ? timeline.shift()! : timeline[0]!;
          return respond(200, state);
        }

        respond(404, {
          error: { message: `mock: unhandled ${req.method} ${url}`, code: 404 },
        });
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, resolve));
    const { port } = this.server!.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server
        ? this.server.close((e) => (e ? reject(e) : resolve()))
        : resolve(),
    );
  }

  createBodies(): unknown[] {
    return this.requests
      .filter((r) => r.method === "POST" && !r.url.includes("/cancel"))
      .map((r) => r.body);
  }
}

/** A completed interaction with report, thoughts, citations, and usage.
 * NOTE: the report text must live in the model_output step — the SDK
 * recomputes output_text from the steps and ignores a server-sent value. */
export function completedInteraction(
  id: string,
  overrides: Partial<MockInteractionPayload> = {},
): MockInteractionPayload {
  const report =
    (overrides.output_text as string | undefined) ??
    "# Findings\n\nThe answer is 42.";
  return {
    id,
    status: "completed",
    created: "2026-08-15T00:00:00Z",
    updated: "2026-08-15T00:12:00Z",
    steps: [
      {
        type: "thought",
        summary: [{ type: "text", text: "Synthesizing sources" }],
      },
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: report,
            annotations: [
              {
                type: "url_citation",
                url: "https://example.com/a",
                title: "Source A",
              },
              { type: "file_citation" },
            ],
          },
        ],
      },
    ],
    usage: {
      total_input_tokens: 1_000,
      total_output_tokens: 20_000,
      total_thought_tokens: 5_000,
      grounding_tool_count: [{ google_search: 12 }],
    },
    ...overrides,
    output_text: report,
  };
}

export function runningInteraction(
  id: string,
  thought = "Searching the web",
): MockInteractionPayload {
  return {
    id,
    status: "in_progress",
    steps: [{ type: "thought", summary: [{ type: "text", text: thought }] }],
  };
}
