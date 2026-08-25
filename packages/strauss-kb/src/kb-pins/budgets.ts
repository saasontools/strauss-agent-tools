import type {
  KbContextBudgets,
  KbMergedPins,
  KbPinsManifest,
} from "./model.js";

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
