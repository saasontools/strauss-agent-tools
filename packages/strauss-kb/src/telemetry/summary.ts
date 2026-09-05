import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  telemetryEventSchema,
  type TelemetryEvent,
  type TelemetryJson,
} from "./model.js";
import { EVENTS_FILE, repoSlug, telemetryRoot } from "./sinks.js";

/** How many of a slug's files the read side opens, newest first. */
const MAX_FILES = 10;

/**
 * What the local stream can answer today. Every other metric named in the
 * telemetry plan waits on a component that does not emit yet.
 */
export const PENDING_METRICS = [
  "coverage",
  "gate block rate",
  "route distribution",
] as const;

export type TelemetrySummary = {
  repo: string;
  since?: string;
  events: number;
  /** Lines nothing could read: a silent drop would look like a zero. */
  unreadable: number;
  byComponent: Record<string, number>;
  /** `validate` errors by check, and `doctor` findings by check. */
  validateErrors: Record<string, number>;
  doctorFindings: Record<string, number>;
  /**
   * Anchor drift: what `stamp` counted, and how `anchor-resolve` ended.
   * `unknownRuns` counts stamps whose drift pass could not run — not a zero.
   */
  drift: {
    drifted: number;
    rebaselined: number;
    unexpected: number;
    unknownRuns: number;
  };
  verifiesByActor: Record<string, number>;
  writesByType: Record<string, number>;
  writesByTag: Record<string, number>;
  /** Named so the gap is visible rather than read as a zero. */
  pending: readonly string[];
};

export type SummaryOptions = { repo?: string; since?: string; cwd?: string };

export async function telemetrySummary(
  options: SummaryOptions = {},
): Promise<TelemetrySummary> {
  const repo = options.repo ?? (await repoSlug(options.cwd ?? process.cwd()));
  const { events, unreadable } = await readEvents(
    join(telemetryRoot(), repo),
    options.since,
  );
  return {
    repo,
    ...(options.since ? { since: options.since } : {}),
    ...summarise(events),
    unreadable,
  };
}

export type ReadEvents = {
  events: TelemetryEvent[];
  /** Lines that were neither JSON nor an event. */
  unreadable: number;
};

/**
 * The newest `MAX_FILES` of a slug's `events*.jsonl`, read a line at a time so
 * a 10 MiB file is never held whole. A line that does not parse is counted.
 */
export async function readEvents(
  dir: string,
  since?: string,
): Promise<ReadEvents> {
  if (since !== undefined && Number.isNaN(Date.parse(since))) {
    throw new Error(`since is not a date the stream can be cut at: ${since}`);
  }
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { events: [], unreadable: 0 };
  }
  const floor = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
  const events: TelemetryEvent[] = [];
  let unreadable = 0;
  for (const name of newestFiles(names)) {
    const lines = createInterface({
      input: createReadStream(join(dir, name), "utf8"),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const parsed = parseLine(line);
      if (!parsed) {
        unreadable += 1;
        continue;
      }
      if (Date.parse(parsed.ts) < floor) continue;
      events.push(parsed);
    }
  }
  events.sort((left, right) => (left.ts < right.ts ? -1 : 1));
  return { events, unreadable };
}

function parseLine(line: string): TelemetryEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
  const parsed = telemetryEventSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Age order is number order, with the live file last; the tail is the newest. */
function newestFiles(names: string[]): string[] {
  const rotated = names
    .map((name) => /^events\.(\d+)\.jsonl$/.exec(name))
    .flatMap((hit) => (hit ? [{ name: hit[0], n: Number(hit[1]) }] : []))
    .sort((left, right) => left.n - right.n)
    .map((entry) => entry.name);
  const ordered = names.includes(EVENTS_FILE)
    ? [...rotated, EVENTS_FILE]
    : rotated;
  return ordered.slice(-MAX_FILES);
}

export function summarise(
  events: TelemetryEvent[],
): Omit<TelemetrySummary, "repo" | "since" | "unreadable"> {
  const byComponent: Record<string, number> = {};
  const validateErrors: Record<string, number> = {};
  const doctorFindings: Record<string, number> = {};
  const verifiesByActor: Record<string, number> = {};
  const writesByType: Record<string, number> = {};
  const writesByTag: Record<string, number> = {};
  const drift = { drifted: 0, rebaselined: 0, unexpected: 0, unknownRuns: 0 };

  for (const event of events) {
    bump(byComponent, event.component);
    const data = event.data;
    switch (event.event) {
      case "validate":
        merge(validateErrors, data["errors"]);
        break;
      case "doctor":
        merge(doctorFindings, data["findings"]);
        break;
      case "anchor-resolve": {
        const rebaselined = count(data["rebaselined"]);
        drift.rebaselined += rebaselined;
        drift.unexpected += Math.max(
          0,
          count(record(data["states"])?.["drifted"]) - rebaselined,
        );
        break;
      }
      case "stamp":
        if (data["driftUnknown"] === true) drift.unknownRuns += 1;
        else drift.drifted += count(data["drifted"]);
        break;
      case "verify":
        bump(verifiesByActor, event.actorClass ?? "unknown");
        break;
      case "write":
      case "write-decision": {
        const type = data["type"];
        if (typeof type === "string") bump(writesByType, type);
        for (const tag of Array.isArray(data["tags"]) ? data["tags"] : []) {
          if (typeof tag === "string") bump(writesByTag, tag);
        }
        break;
      }
    }
  }

  return {
    events: events.length,
    byComponent,
    validateErrors,
    doctorFindings,
    drift,
    verifiesByActor,
    writesByType,
    writesByTag,
    pending: PENDING_METRICS,
  };
}

function bump(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1;
}

/** Adds a `{ key: count }` map from one event into a running total. */
function merge(
  into: Record<string, number>,
  value: TelemetryJson | undefined,
): void {
  for (const [key, amount] of Object.entries(record(value) ?? {})) {
    into[key] = (into[key] ?? 0) + count(amount);
  }
}

function record(
  value: TelemetryJson | undefined,
): Record<string, TelemetryJson> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function count(value: TelemetryJson | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function renderSummary(summary: TelemetrySummary): string {
  const lines = [
    `# Telemetry — ${summary.repo}`,
    `events: ${summary.events}${summary.since ? ` since ${summary.since}` : ""}${
      summary.unreadable ? `, ${summary.unreadable} unreadable` : ""
    }`,
    "",
    ...table("events by component", summary.byComponent),
    ...table("validate errors by check", summary.validateErrors),
    ...table("doctor findings by check", summary.doctorFindings),
    ...table("drift", {
      drifted: summary.drift.drifted,
      rebaselined: summary.drift.rebaselined,
      unexpected: summary.drift.unexpected,
      "unknown (runs)": summary.drift.unknownRuns,
    }),
    ...table("verifies by actor class", summary.verifiesByActor),
    ...table("writes by type", summary.writesByType),
    ...table("writes by tag", summary.writesByTag),
    `## pending`,
    ...summary.pending.map(
      (metric) => `  ${metric} — emitted by later components`,
    ),
    "",
  ];
  return lines.join("\n");
}

function table(heading: string, counts: Record<string, number>): string[] {
  const entries = Object.entries(counts).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  if (!entries.length) return [`## ${heading}`, "  none", ""];
  const width = Math.max(...entries.map(([key]) => key.length));
  return [
    `## ${heading}`,
    ...entries.map(
      ([key, value]) => `  ${key.padEnd(width)}  ${String(value).padStart(5)}`,
    ),
    "",
  ];
}
