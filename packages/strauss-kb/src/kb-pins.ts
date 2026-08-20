import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { KbStore } from "./kb-store.js";

/**
 * The pin manifest, relative to the working directory.
 *
 * Pins are workspace state, not base state: they record which bases this
 * workspace wants surfaced at every context birth. The pinned base is never
 * touched — not even its log — because a base must remain copyable without
 * knowing who pins it.
 */
export const PINS_FILE = join(".strauss", "kb-pins.json");

/**
 * Primary state — it records an intent nothing else holds — but trivially
 * rewritable, so a full rewrite on change is fine and no append log is needed.
 * Unknown keys are preserved on rewrite, the same tolerance the record reader
 * extends to frontmatter it did not write.
 */
const pinSchema = z
  .object({
    /** Relative to the manifest's directory, so the file is committable. */
    path: z.string().min(1),
    pinnedAt: z.string().min(1).optional(),
    /**
     * How `context` renders this base. `full` preloads the whole base into
     * the block regardless of the full-under threshold — for a base whose
     * contents should simply be present, the way an ADR base should be —
     * still answering to the block budget, with an index fallback that says
     * so when it cannot fit. `index` never upgrades, whatever the threshold.
     * Absent: the profile's full-under threshold decides. Invalid values
     * degrade to absent rather than failing the manifest.
     */
    mode: z.enum(["full", "index"]).optional().catch(undefined),
    /**
     * Context profiles this pin surfaces in (e.g. only at session-start,
     * not per turn). Absent: every profile. A run without a profile sees
     * every pin. A base that only matters to one skill is better loaded by
     * that skill at point of use than pinned at all — pins are what every
     * session should see.
     */
    profiles: z.array(z.string()).optional().catch(undefined),
  })
  .passthrough();

const pinsManifestSchema = z
  .object({
    pins: z.array(pinSchema).default([]),
    /**
     * Per-repo budgets for the `context` command, keyed by profile —
     * `"session-start"`, `"compact"`, `"turn"`, or `"default"` for all of
     * them. Deliberately untyped here: a typo'd budget must degrade to the
     * built-in default, not make the whole manifest unreadable and silence
     * the index at every session start. `contextProfileBudgets` does the
     * tolerant read.
     */
    context: z.unknown().optional(),
  })
  .passthrough();

export type KbPin = z.infer<typeof pinSchema>;
export type KbPinsManifest = z.infer<typeof pinsManifestSchema>;

export type KbContextBudgets = {
  budgetTokens?: number;
  fullUnderTokens?: number;
};

/** Sane integers only; anything else is ignored, not an error. */
function asBudgets(value: unknown): KbContextBudgets {
  if (value === null || typeof value !== "object") return {};
  const table = value as Record<string, unknown>;
  const pick = (key: string, min: number) => {
    const raw = table[key];
    return typeof raw === "number" && Number.isInteger(raw) && raw >= min
      ? raw
      : undefined;
  };
  const budgetTokens = pick("budgetTokens", 1);
  // 0 is meaningful — "full-under off", overriding a `default` that set it.
  const fullUnderTokens = pick("fullUnderTokens", 0);
  return {
    ...(budgetTokens ? { budgetTokens } : {}),
    ...(fullUnderTokens !== undefined ? { fullUnderTokens } : {}),
  };
}

/**
 * The manifest's budgets for one profile: the named profile's values over the
 * manifest's `"default"` entry. What is absent here falls through to the
 * caller's built-ins — the manifest narrows, it never has to be complete.
 */
export function contextProfileBudgets(
  manifest: KbPinsManifest,
  profile?: string,
): KbContextBudgets {
  const table = manifest.context;
  if (table === null || typeof table !== "object") return {};
  const entries = table as Record<string, unknown>;
  return {
    ...asBudgets(entries["default"]),
    ...(profile ? asBudgets(entries[profile]) : {}),
  };
}

/** One pinned base, with whether it currently resolves to anything readable. */
export type KbPinStatus = {
  /** As stored — relative to the manifest's directory. */
  path: string;
  pinnedAt: string | null;
  absolutePath: string;
  /** The directory exists and yielded at least one parseable record. */
  valid: boolean;
  recordCount: number;
  mode: "full" | "index" | null;
  profiles: string[] | null;
};

export class KbPinsMalformedError extends Error {
  constructor(file: string, cause: string) {
    super(`pin manifest ${file} is not readable (${cause}) — fix or remove it`);
    this.name = "KbPinsMalformedError";
  }
}

/**
 * The manifest, or an empty one when the file is missing.
 *
 * A malformed file throws rather than being treated as empty: every write path
 * does a full rewrite, and rewriting over content we could not read would
 * destroy the one copy of it. Read-only consumers that must stay silent
 * (`context` from a session hook) catch this and fail open themselves.
 */
export async function readPinsManifest(
  workspaceDir: string,
): Promise<KbPinsManifest> {
  const file = join(resolve(workspaceDir), PINS_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { pins: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new KbPinsMalformedError(
      file,
      error instanceof Error ? error.message : "invalid JSON",
    );
  }
  const manifest = pinsManifestSchema.safeParse(parsed);
  if (!manifest.success) {
    throw new KbPinsMalformedError(
      file,
      manifest.error.issues[0]?.message ?? "invalid shape",
    );
  }
  return manifest.data;
}

async function writePinsManifest(
  workspaceDir: string,
  manifest: KbPinsManifest,
): Promise<void> {
  const file = join(resolve(workspaceDir), PINS_FILE);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/** Where a stored pin points, resolved against the manifest's directory. */
export function resolvePinPath(workspaceDir: string, path: string): string {
  return isAbsolute(path)
    ? resolve(path)
    : resolve(workspaceDir, path.split("/").join(sep));
}

/** How a base is spelled in the manifest: relative, forward slashes. */
function storablePath(workspaceDir: string, bundlePath: string): string {
  const rel = relative(resolve(workspaceDir), resolve(bundlePath));
  return (rel === "" ? "." : rel).split(sep).join("/");
}

export type KbPinResult = {
  path: string;
  pinnedAt: string;
  alreadyPinned: boolean;
  mode?: "full" | "index";
  profiles?: string[];
  /** Set when the path holds no readable records — pinned anyway. */
  warning?: string;
};

export type KbPinOptions = {
  mode?: "full" | "index";
  profiles?: string[];
};

/**
 * Adds a base to the manifest. Idempotent — re-pinning a pinned path with no
 * options returns the existing entry untouched, and re-pinning with `mode`
 * or `profiles` updates just those fields, which is how a pin's rendering is
 * changed. A path that is not (yet) a valid base succeeds with a warning:
 * bases are routinely pinned before they are populated, the same way records
 * link to records that do not exist yet.
 */
export async function pinBase(
  store: KbStore,
  workspaceDir: string,
  bundlePath: string,
  at: string,
  options: KbPinOptions = {},
): Promise<KbPinResult> {
  const manifest = await readPinsManifest(workspaceDir);
  const absolute = resolvePinPath(
    workspaceDir,
    storablePath(workspaceDir, bundlePath),
  );

  const existing = manifest.pins.find(
    (entry) => resolvePinPath(workspaceDir, entry.path) === absolute,
  );
  const records = await store.list(absolute);
  const warning =
    records.length === 0
      ? `no records found at ${absolute} — pinned anyway; bases are routinely pinned before they are populated`
      : undefined;

  const fields = {
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.profiles?.length ? { profiles: options.profiles } : {}),
  };

  if (existing) {
    const updated: KbPin = { ...existing, ...fields };
    if (Object.keys(fields).length) {
      await writePinsManifest(workspaceDir, {
        ...manifest,
        pins: manifest.pins.map((entry) =>
          entry === existing ? updated : entry,
        ),
      });
    }
    return {
      path: existing.path,
      pinnedAt: existing.pinnedAt ?? at,
      alreadyPinned: true,
      ...(updated.mode ? { mode: updated.mode } : {}),
      ...(updated.profiles ? { profiles: updated.profiles } : {}),
      ...(warning ? { warning } : {}),
    };
  }

  const entry: KbPin = {
    path: storablePath(workspaceDir, bundlePath),
    pinnedAt: at,
    ...fields,
  };
  await writePinsManifest(workspaceDir, {
    ...manifest,
    pins: [...manifest.pins, entry],
  });
  return {
    path: entry.path,
    pinnedAt: at,
    alreadyPinned: false,
    ...fields,
    ...(warning ? { warning } : {}),
  };
}

/** Removes a base from the manifest. Says whether anything was there. */
export async function unpinBase(
  workspaceDir: string,
  bundlePath: string,
): Promise<{ path: string; removed: boolean }> {
  const manifest = await readPinsManifest(workspaceDir);
  const absolute = resolvePinPath(
    workspaceDir,
    storablePath(workspaceDir, bundlePath),
  );
  const kept = manifest.pins.filter(
    (entry) => resolvePinPath(workspaceDir, entry.path) !== absolute,
  );
  const removed = kept.length !== manifest.pins.length;
  if (removed)
    await writePinsManifest(workspaceDir, { ...manifest, pins: kept });
  return { path: storablePath(workspaceDir, bundlePath), removed };
}

/** Every pin, with whether it currently points at a readable base. */
export async function listPins(
  store: KbStore,
  workspaceDir: string,
): Promise<KbPinStatus[]> {
  const manifest = await readPinsManifest(workspaceDir);
  return Promise.all(
    manifest.pins.map(async (entry) => {
      const absolutePath = resolvePinPath(workspaceDir, entry.path);
      const records = await store.list(absolutePath);
      return {
        path: entry.path,
        pinnedAt: entry.pinnedAt ?? null,
        absolutePath,
        valid: records.length > 0,
        recordCount: records.length,
        mode: entry.mode ?? null,
        profiles: entry.profiles ?? null,
      };
    }),
  );
}
