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
  })
  .passthrough();

const pinsManifestSchema = z
  .object({ pins: z.array(pinSchema).default([]) })
  .passthrough();

export type KbPin = z.infer<typeof pinSchema>;
export type KbPinsManifest = z.infer<typeof pinsManifestSchema>;

/** One pinned base, with whether it currently resolves to anything readable. */
export type KbPinStatus = {
  /** As stored — relative to the manifest's directory. */
  path: string;
  pinnedAt: string | null;
  absolutePath: string;
  /** The directory exists and yielded at least one parseable record. */
  valid: boolean;
  recordCount: number;
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
  /** Set when the path holds no readable records — pinned anyway. */
  warning?: string;
};

/**
 * Adds a base to the manifest. Idempotent — pinning a pinned path returns the
 * existing entry untouched. A path that is not (yet) a valid base succeeds
 * with a warning: bases are routinely pinned before they are populated, the
 * same way records link to records that do not exist yet.
 */
export async function pinBase(
  store: KbStore,
  workspaceDir: string,
  bundlePath: string,
  at: string,
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

  if (existing) {
    return {
      path: existing.path,
      pinnedAt: existing.pinnedAt ?? at,
      alreadyPinned: true,
      ...(warning ? { warning } : {}),
    };
  }

  const entry: KbPin = {
    path: storablePath(workspaceDir, bundlePath),
    pinnedAt: at,
  };
  await writePinsManifest(workspaceDir, {
    ...manifest,
    pins: [...manifest.pins, entry],
  });
  return {
    path: entry.path,
    pinnedAt: at,
    alreadyPinned: false,
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
      };
    }),
  );
}
