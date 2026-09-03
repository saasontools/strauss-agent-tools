import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  KbStampBaselineError,
  KbStampDigestBaselineError,
} from "../kb-errors.js";
import { readMergedPins } from "../kb-pins/index.js";
import type { KbStampResult } from "../kb-store.js";
import { argvFlag, define } from "./model.js";

/** One base's stamp, plus which records moved when a baseline was given. */
type KbStampReport = KbStampResult & {
  /** Changed, added or removed ids; null when the baseline was a digest. */
  changed: string[] | null;
};

const DIGEST = /^[0-9a-f]{64}$/;

export const stampCommand = define({
  name: "stamp",
  tool: "kb_stamp",
  usage: "stamp [--bundle PATH] [--since DIGEST|FILE]",
  description:
    "Content stamp of a base — `load`'s digest, record counts, per-record digests — without any bodies. Takes no bundlePath to stamp every pinned base. With `since`, reports only the bases that moved, naming the changed ids when the baseline is a prior stamp; silent when nothing changed. Reads, never writes.",
  input: z.object({
    bundlePath: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Absolute path to one knowledge base. Omit to stamp every pinned base.",
      ),
    since: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Prior digest, or path to a prior `stamp --json`; only moved bases return, with changed ids when the baseline is a file.",
      ),
  }),
  fromArgv: (argv, path, _stdin, bundleExplicit) => {
    const since = argvFlag(argv, "--since");
    return {
      ...(bundleExplicit ? { bundlePath: path } : {}),
      ...(since !== undefined ? { since } : {}),
    };
  },
  run: async ({ store }, { bundlePath, since }) => {
    const targets = bundlePath
      ? [bundlePath]
      : (await readMergedPins(process.cwd())).pins.map(
          (pin) => pin.absolutePath,
        );

    // A digest baseline only answers equality, and equality against which
    // base is ambiguous once more than one is in play — a file baseline
    // carries a digest per base and has no such limit.
    if (since !== undefined && DIGEST.test(since) && targets.length > 1) {
      throw new KbStampDigestBaselineError(since);
    }

    const stamps = await Promise.all(
      targets.map((target) => store.stamp(target)),
    );
    if (since === undefined) {
      return stamps.map((stamp) => ({ ...stamp, changed: null }));
    }

    const baseline = await readBaseline(since);
    const reports: KbStampReport[] = [];
    for (const stamp of stamps) {
      const before = baseline.byPath.get(stamp.path);
      if (baseline.digest !== null) {
        if (baseline.digest === stamp.digest) continue;
        reports.push({ ...stamp, changed: null });
        continue;
      }
      // A base absent from the baseline was never injected — reported whole,
      // the same as a base whose every record is new.
      if (before && before.digest === stamp.digest) continue;
      reports.push({ ...stamp, changed: changedIds(before?.records, stamp) });
    }
    return reports;
  },
  render: (result) =>
    (result as KbStampReport[])
      .map((report) => {
        const counts = `${report.recordCount} record(s), ${report.superseded} superseded`;
        const head = `${report.path}  ${report.digest}  ${counts}${
          report.newestAt ? `  newest ${report.newestAt}` : ""
        }`;
        return report.changed?.length
          ? `${head}\n  changed: ${report.changed.join(", ")}`
          : head;
      })
      .join("\n"),
});

function changedIds(
  before: Map<string, string> | undefined,
  stamp: KbStampResult,
): string[] {
  const now = new Map(
    stamp.records.map((record) => [record.conceptId, record.digest]),
  );
  const ids = new Set<string>();
  for (const [conceptId, digest] of now) {
    if (before?.get(conceptId) !== digest) ids.add(conceptId);
  }
  for (const conceptId of before?.keys() ?? []) {
    if (!now.has(conceptId)) ids.add(conceptId);
  }
  return [...ids].sort();
}

/**
 * `--since` is either a digest — an equality answer, no ids to name — or a
 * path to a prior `stamp --json` (equally, a hook's session state file), which
 * carries the per-record digests a changed-id list needs.
 */
async function readBaseline(since: string): Promise<{
  digest: string | null;
  byPath: Map<string, { digest: string; records: Map<string, string> }>;
}> {
  if (DIGEST.test(since)) return { digest: since, byPath: new Map() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(since, "utf8"));
  } catch {
    throw new KbStampBaselineError(since);
  }

  // Either a `stamp --json` array, or a hook's session state file, which
  // carries the same entries under `stamps` beside the git head it saw.
  const entries = Array.isArray(parsed)
    ? parsed
    : ((parsed as { stamps?: unknown[] })?.stamps ?? []);
  const byPath = new Map<
    string,
    { digest: string; records: Map<string, string> }
  >();
  for (const entry of entries as {
    path?: string;
    digest?: string;
    records?: { conceptId: string; digest: string }[];
  }[]) {
    if (typeof entry?.path !== "string" || typeof entry?.digest !== "string") {
      continue;
    }
    byPath.set(entry.path, {
      digest: entry.digest,
      records: new Map(
        (entry.records ?? []).map((record) => [
          record.conceptId,
          record.digest,
        ]),
      ),
    });
  }
  return { digest: null, byPath };
}
