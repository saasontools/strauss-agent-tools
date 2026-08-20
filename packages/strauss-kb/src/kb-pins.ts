import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { KbStore } from "./kb-store.js";

/**
 * Pin manifests, in three layers.
 *
 * Pins are workspace state, not base state: they record which bases a session
 * should be shown at every context birth. The pinned base is never touched —
 * not even its log — because a base must remain copyable without knowing who
 * pins it.
 *
 * The layers, nearest wins when the same base appears in more than one:
 *
 * | layer   | file                              | for                          |
 * | ------- | --------------------------------- | ---------------------------- |
 * | project | <workspace>/.strauss/kb-pins.json       | committed, the team's pins   |
 * | local   | <workspace>/.strauss/kb-pins.local.json | personal, gitignored         |
 * | user    | ~/.strauss/kb-pins.json                 | personal, every workspace    |
 *
 * Every manifest's paths resolve against its own root — the workspace for
 * project and local, the home directory for user — so each file is portable
 * with the tree it belongs to. `STRAUSS_KB_USER_ROOT` overrides the user root
 * (tests, unusual homes).
 */
export const PINS_FILE = join(".strauss", "kb-pins.json");
export const PINS_LOCAL_FILE = join(".strauss", "kb-pins.local.json");

export const PIN_LAYERS = ["project", "local", "user"] as const;
export type KbPinLayer = (typeof PIN_LAYERS)[number];

function userRoot(): string {
  return process.env.STRAUSS_KB_USER_ROOT || homedir();
}

/** The directory a layer's stored paths resolve against. */
function layerRoot(workspaceDir: string, layer: KbPinLayer): string {
  return layer === "user" ? userRoot() : resolve(workspaceDir);
}

function layerFile(workspaceDir: string, layer: KbPinLayer): string {
  return join(
    layerRoot(workspaceDir, layer),
    layer === "local" ? PINS_LOCAL_FILE : PINS_FILE,
  );
}

/**
 * Primary state — it records an intent nothing else holds — but trivially
 * rewritable, so a full rewrite on change is fine and no append log is needed.
 * Unknown keys are preserved on rewrite, the same tolerance the record reader
 * extends to frontmatter it did not write.
 */
const pinSchema = z
  .object({
    /** Relative to the manifest's root, so the file is committable. */
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
    /**
     * The base is concluded — a finished piece of research, a frozen ADR
     * set. Write commands against it refuse while this workspace holds the
     * pin, and `context` labels it read-only. Workspace policy, not base
     * state: the base itself stays copyable and writable elsewhere.
     */
    frozen: z.boolean().optional().catch(undefined),
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
 * One manifest's budgets for one profile: the named profile's values over the
 * manifest's `"default"` entry. What is absent here falls through to the
 * caller's built-ins — a manifest narrows, it never has to be complete.
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

export class KbPinsMalformedError extends Error {
  constructor(file: string, cause: string) {
    super(`pin manifest ${file} is not readable (${cause}) — fix or remove it`);
    this.name = "KbPinsMalformedError";
  }
}

export class KbBaseFrozenError extends Error {
  constructor(bundlePath: string, layer: KbPinLayer) {
    super(
      `${bundlePath} is frozen (read-only) by this workspace's ${layer} pin manifest — re-pin with --unfreeze, or unpin, to change it`,
    );
    this.name = "KbBaseFrozenError";
  }
}

/**
 * One layer's manifest, or an empty one when the file is missing.
 *
 * A malformed file throws rather than being treated as empty: every write path
 * does a full rewrite, and rewriting over content we could not read would
 * destroy the one copy of it. Read-only consumers that must stay silent
 * (`context` from a session hook, the merged reader) skip malformed layers
 * themselves.
 */
export async function readPinsLayer(
  workspaceDir: string,
  layer: KbPinLayer,
): Promise<KbPinsManifest> {
  const file = layerFile(workspaceDir, layer);
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

/** The project layer — kept for compatibility with earlier callers. */
export async function readPinsManifest(
  workspaceDir: string,
): Promise<KbPinsManifest> {
  return readPinsLayer(workspaceDir, "project");
}

async function writePinsLayer(
  workspaceDir: string,
  layer: KbPinLayer,
  manifest: KbPinsManifest,
): Promise<void> {
  const file = layerFile(workspaceDir, layer);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/** Where a stored pin points, resolved against its layer's root. */
export function resolvePinPath(rootDir: string, path: string): string {
  return isAbsolute(path)
    ? resolve(path)
    : resolve(rootDir, path.split("/").join(sep));
}

/** How a base is spelled in a manifest: relative to the layer root, forward slashes. */
function storablePath(rootDir: string, bundlePath: string): string {
  const rel = relative(resolve(rootDir), resolve(bundlePath));
  return (rel === "" ? "." : rel).split(sep).join("/");
}

/** A pin as the merged view hands it back: entry + where it came from. */
export type KbMergedPin = KbPin & {
  layer: KbPinLayer;
  absolutePath: string;
};

export type KbMergedPins = {
  /** Effective pins after dedup — nearest layer wins per resolved path. */
  pins: KbMergedPin[];
  /** Per-layer manifests that parsed, for budget merging. */
  manifests: Partial<Record<KbPinLayer, KbPinsManifest>>;
};

/**
 * All three layers, merged. A malformed layer is skipped rather than thrown:
 * this feeds hooks at every session start, and one broken personal file must
 * not silence the team's pins — `pin`/`unpin` against the broken layer still
 * refuse loudly.
 */
export async function readMergedPins(
  workspaceDir: string,
): Promise<KbMergedPins> {
  const manifests: Partial<Record<KbPinLayer, KbPinsManifest>> = {};
  const pins: KbMergedPin[] = [];
  const seen = new Set<string>();

  for (const layer of PIN_LAYERS) {
    let manifest: KbPinsManifest;
    try {
      manifest = await readPinsLayer(workspaceDir, layer);
    } catch {
      continue;
    }
    manifests[layer] = manifest;
    const root = layerRoot(workspaceDir, layer);
    for (const entry of manifest.pins) {
      const absolutePath = resolvePinPath(root, entry.path);
      if (seen.has(absolutePath)) continue;
      seen.add(absolutePath);
      pins.push({ ...entry, layer, absolutePath });
    }
  }
  return { pins, manifests };
}

/**
 * Budgets across the layers: user underneath, local over it, project on top —
 * the committed file is the workspace's word — and explicit flags above all
 * of this, applied by the caller.
 */
export function mergedContextBudgets(
  merged: KbMergedPins,
  profile?: string,
): KbContextBudgets {
  const layered = (["user", "local", "project"] as const).map((layer) => {
    const manifest = merged.manifests[layer];
    return manifest ? contextProfileBudgets(manifest, profile) : {};
  });
  return { ...layered[0], ...layered[1], ...layered[2] };
}

/** One pinned base, with whether it currently resolves to anything readable. */
export type KbPinStatus = {
  /** As stored — relative to its layer's root. */
  path: string;
  layer: KbPinLayer;
  pinnedAt: string | null;
  absolutePath: string;
  /** The directory exists and yielded at least one parseable record. */
  valid: boolean;
  recordCount: number;
  mode: "full" | "index" | null;
  profiles: string[] | null;
  frozen: boolean;
};

export type KbPinResult = {
  path: string;
  layer: KbPinLayer;
  pinnedAt: string;
  alreadyPinned: boolean;
  mode?: "full" | "index";
  profiles?: string[];
  frozen?: boolean;
  /** Set when the path holds no readable records — pinned anyway. */
  warning?: string;
};

export type KbPinOptions = {
  mode?: "full" | "index";
  profiles?: string[];
  frozen?: boolean;
  /** Which manifest to write. Defaults to the committed project layer. */
  layer?: KbPinLayer;
};

/**
 * Adds a base to one layer's manifest. Idempotent — re-pinning a pinned path
 * with no options returns the existing entry untouched, and re-pinning with
 * `mode`, `profiles`, or `frozen` updates just those fields, which is how a
 * pin's rendering or writability is changed. A path that is not (yet) a valid
 * base succeeds with a warning: bases are routinely pinned before they are
 * populated, the same way records link to records that do not exist yet.
 */
export async function pinBase(
  store: KbStore,
  workspaceDir: string,
  bundlePath: string,
  at: string,
  options: KbPinOptions = {},
): Promise<KbPinResult> {
  const layer = options.layer ?? "project";
  const root = layerRoot(workspaceDir, layer);
  const manifest = await readPinsLayer(workspaceDir, layer);
  const absolute = resolvePinPath(root, storablePath(root, bundlePath));

  const existing = manifest.pins.find(
    (entry) => resolvePinPath(root, entry.path) === absolute,
  );
  const records = await store.list(absolute);
  const warning =
    records.length === 0
      ? `no records found at ${absolute} — pinned anyway; bases are routinely pinned before they are populated`
      : undefined;

  const fields = {
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.profiles?.length ? { profiles: options.profiles } : {}),
    ...(options.frozen !== undefined ? { frozen: options.frozen } : {}),
  };

  if (existing) {
    const updated: KbPin = { ...existing, ...fields };
    if (Object.keys(fields).length) {
      await writePinsLayer(workspaceDir, layer, {
        ...manifest,
        pins: manifest.pins.map((entry) =>
          entry === existing ? updated : entry,
        ),
      });
    }
    return {
      path: existing.path,
      layer,
      pinnedAt: existing.pinnedAt ?? at,
      alreadyPinned: true,
      ...(updated.mode ? { mode: updated.mode } : {}),
      ...(updated.profiles ? { profiles: updated.profiles } : {}),
      ...(updated.frozen !== undefined ? { frozen: updated.frozen } : {}),
      ...(warning ? { warning } : {}),
    };
  }

  const entry: KbPin = {
    path: storablePath(root, bundlePath),
    pinnedAt: at,
    ...fields,
  };
  await writePinsLayer(workspaceDir, layer, {
    ...manifest,
    pins: [...manifest.pins, entry],
  });
  return {
    path: entry.path,
    layer,
    pinnedAt: at,
    alreadyPinned: false,
    ...fields,
    ...(warning ? { warning } : {}),
  };
}

/**
 * Removes a base from every layer that holds it — unpinned means gone, not
 * "gone from one file and still injected from another". A malformed layer is
 * skipped (it cannot be rewritten safely); the layers actually touched are
 * reported.
 */
export async function unpinBase(
  workspaceDir: string,
  bundlePath: string,
): Promise<{ path: string; removed: boolean; layers: KbPinLayer[] }> {
  const layers: KbPinLayer[] = [];
  for (const layer of PIN_LAYERS) {
    const root = layerRoot(workspaceDir, layer);
    let manifest: KbPinsManifest;
    try {
      manifest = await readPinsLayer(workspaceDir, layer);
    } catch {
      continue;
    }
    const absolute = resolvePinPath(root, storablePath(root, bundlePath));
    const kept = manifest.pins.filter(
      (entry) => resolvePinPath(root, entry.path) !== absolute,
    );
    if (kept.length !== manifest.pins.length) {
      await writePinsLayer(workspaceDir, layer, { ...manifest, pins: kept });
      layers.push(layer);
    }
  }
  return {
    path: storablePath(resolve(workspaceDir), bundlePath),
    removed: layers.length > 0,
    layers,
  };
}

/** Every effective pin across the layers, with whether it points at records. */
export async function listPins(
  store: KbStore,
  workspaceDir: string,
): Promise<KbPinStatus[]> {
  const merged = await readMergedPins(workspaceDir);
  return Promise.all(
    merged.pins.map(async (entry) => {
      const records = await store.list(entry.absolutePath);
      return {
        path: entry.path,
        layer: entry.layer,
        pinnedAt: entry.pinnedAt ?? null,
        absolutePath: entry.absolutePath,
        valid: records.length > 0,
        recordCount: records.length,
        mode: entry.mode ?? null,
        profiles: entry.profiles ?? null,
        frozen: entry.frozen === true,
      };
    }),
  );
}

/**
 * Refuses when a write would land in a base this workspace froze. Called by
 * every mutating command; a workspace that pinned a base `--frozen` said the
 * base is concluded, and a quiet write past that would be exactly the silent
 * drift the pin was meant to stop.
 */
export async function assertBaseNotFrozen(
  workspaceDir: string,
  bundlePath: string,
): Promise<void> {
  const merged = await readMergedPins(workspaceDir);
  const absolute = resolve(bundlePath);
  const pin = merged.pins.find((entry) => entry.absolutePath === absolute);
  if (pin?.frozen === true) {
    throw new KbBaseFrozenError(pin.path, pin.layer);
  }
}
