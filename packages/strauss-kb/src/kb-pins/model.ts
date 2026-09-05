import { join } from "node:path";
import { z } from "zod";

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
 * | layer   | file                                    | for                        |
 * | ------- | --------------------------------------- | -------------------------- |
 * | project | <workspace>/.strauss/kb-pins.json       | committed, the team's pins |
 * | local   | <workspace>/.strauss/kb-pins.local.json | personal, gitignored       |
 * | user    | ~/.strauss/kb-pins.json                 | personal, every workspace  |
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

/**
 * Primary state — it records an intent nothing else holds — but trivially
 * rewritable, so a full rewrite on change is fine and no append log is needed.
 * Unknown keys are preserved on rewrite, the same tolerance the record reader
 * extends to frontmatter it did not write.
 */
export const pinSchema = z
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

export const pinsManifestSchema = z
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

/** One profile's `context` settings, from the manifest or the built-ins. */
export type KbContextBudgets = {
  budgetTokens?: number;
  fullUnderTokens?: number;
  /**
   * Frontmatter tags whose records this profile leaves out of the block —
   * `review`, say, kept out of session-start without unpinning the base.
   */
  excludeTags?: string[];
};

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
