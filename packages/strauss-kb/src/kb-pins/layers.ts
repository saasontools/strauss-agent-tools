import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  appendIgnoreLines,
  GITIGNORE_FILE,
  STRAUSS_IGNORE_RULES,
} from "../kb-gitignore.js";
import { KbPinsMalformedError } from "./errors.js";
import {
  PIN_LAYERS,
  PINS_FILE,
  PINS_LOCAL_FILE,
  pinsManifestSchema,
  type KbMergedPin,
  type KbMergedPins,
  type KbPinLayer,
  type KbPinsManifest,
} from "./model.js";

function userRoot(): string {
  return process.env.STRAUSS_KB_USER_ROOT || homedir();
}

/** The directory a layer's stored paths resolve against. */
export function layerRoot(workspaceDir: string, layer: KbPinLayer): string {
  return layer === "user" ? userRoot() : resolve(workspaceDir);
}

function layerFile(workspaceDir: string, layer: KbPinLayer): string {
  return join(
    layerRoot(workspaceDir, layer),
    layer === "local" ? PINS_LOCAL_FILE : PINS_FILE,
  );
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

export async function writePinsLayer(
  workspaceDir: string,
  layer: KbPinLayer,
  manifest: KbPinsManifest,
): Promise<void> {
  const file = layerFile(workspaceDir, layer);
  await mkdir(dirname(file), { recursive: true });
  if (layer === "local") await ensureLocalPinsIgnored(dirname(file));
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Excludes `kb-pins.local.json` from `<workspace>/.strauss/.gitignore` — the
 * committed manifest sits beside it, so the rule names the personal file
 * alone. Only the local layer: the user layer is outside any workspace.
 *
 * Best-effort, and silent because this layer has no logger: the manifest
 * write is the operation the caller asked for, and it must not fail because
 * a `.gitignore` could not be written.
 */
async function ensureLocalPinsIgnored(dir: string): Promise<void> {
  const target = join(dir, GITIGNORE_FILE);
  try {
    let existing: string | null;
    try {
      existing = await readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      existing = null;
    }

    if (existing === null) {
      await writeFile(target, appendIgnoreLines("", STRAUSS_IGNORE_RULES), {
        encoding: "utf8",
        // Exclusive: a writer that won the race between our read and our
        // write already put the rule there, and must not be truncated.
        flag: "wx",
      });
      return;
    }
    const addition = appendIgnoreLines(existing, STRAUSS_IGNORE_RULES);
    if (addition) await appendFile(target, addition, "utf8");
  } catch {
    // See above: never fails the pin.
  }
}

/** Where a stored pin points, resolved against its layer's root. */
export function resolvePinPath(rootDir: string, path: string): string {
  return isAbsolute(path)
    ? resolve(path)
    : resolve(rootDir, path.split("/").join(sep));
}

/** How a base is spelled in a manifest: relative to the layer root, forward slashes. */
export function storablePath(rootDir: string, bundlePath: string): string {
  const rel = relative(resolve(rootDir), resolve(bundlePath));
  return (rel === "" ? "." : rel).split(sep).join("/");
}

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
