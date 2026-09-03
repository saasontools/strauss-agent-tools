import { z } from "zod";
import {
  doctor,
  DEFAULT_AGING_DAYS,
  DEFAULT_EXPIRING_DAYS,
  DEFAULT_UNVERIFIED_DAYS,
  type KbDoctorReport,
} from "../doctor.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "./model.js";

export type KbDoctorCommandResult = KbDoctorReport & {
  bundlePath: string;
  checkedAt: string;
};

const days = (what: string, fallback: number) =>
  z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`${what} Defaults to ${fallback}.`);

export const doctorCommand = define({
  name: "doctor",
  tool: "kb_doctor",
  usage:
    "doctor [--expiring-days N] [--unverified-days N] [--aging-days N] [--repo-root PATH] [--strict]",
  description:
    "Read-only health sweep: expired, expiring, unverified, aging, orphaned, broken-supersession, superseded-but-cited, drifted anchors. Every group is reported even when empty; nothing is written or re-stamped. Use it when picking up a base you have not touched in a while; kb_validate only checks that pointers between records agree.",
  input: z.object({
    bundlePath,
    repoRoot: REPO_ROOT,
    expiringDays: days(
      "How far ahead `expiring` looks, in days.",
      DEFAULT_EXPIRING_DAYS,
    ),
    unverifiedDays: days(
      "How old an unconfirmed record must be before `unverified` reports it, in days.",
      DEFAULT_UNVERIFIED_DAYS,
    ),
    agingDays: days(
      "How long a record may stay `open` or `proposed` before `aging` reports it, in days.",
      DEFAULT_AGING_DAYS,
    ),
    strict: z
      .boolean()
      .optional()
      .describe(
        "Turn an expired record into a non-zero exit for the CLI. No effect on the report itself.",
      ),
  }),
  // Presence, not truthiness: `--expiring-days ""` is a caller who meant
  // something and mistyped it, and a falsy test would answer by quietly
  // sweeping at the default. Passed through as given, the schema rejects it
  // and says which field.
  fromArgv: (argv, path) => {
    const expiring = argvFlag(argv, "--expiring-days");
    const unverified = argvFlag(argv, "--unverified-days");
    const agingDays = argvFlag(argv, "--aging-days");
    const repoRoot = argvFlag(argv, "--repo-root");
    return {
      bundlePath: path,
      ...(repoRoot !== undefined ? { repoRoot } : {}),
      ...(expiring !== undefined ? { expiringDays: Number(expiring) } : {}),
      ...(unverified !== undefined
        ? { unverifiedDays: Number(unverified) }
        : {}),
      ...(agingDays !== undefined ? { agingDays: Number(agingDays) } : {}),
      ...(argv.includes("--strict") ? { strict: true } : {}),
    };
  },
  run: async (
    { store, now },
    { bundlePath: path, expiringDays, unverifiedDays, agingDays, repoRoot },
  ) => {
    const checkedAt = now();
    const records = await store.list(path);
    // Read-only, like every other check here: the sweep names the drifted
    // anchors and leaves the re-stamp to `anchor-resolve`, which is the verb
    // that writes.
    const anchorDrift = await store.detectDrift(records, repoRoot);
    const report = doctor(records, {
      ...(expiringDays !== undefined ? { expiringDays } : {}),
      ...(unverifiedDays !== undefined ? { unverifiedDays } : {}),
      ...(agingDays !== undefined ? { agingDays } : {}),
      ...(anchorDrift !== undefined ? { anchorDrift } : {}),
      now: new Date(checkedAt),
    });
    return { bundlePath: path, checkedAt, ...report };
  },
  render: (result) => render(result as KbDoctorCommandResult),
  // Only expiry, and only under --strict. The other seven checks report debt a
  // reader decides about; an expired record is the base asserting something it
  // already said it would stop standing behind, which is the one finding a
  // pipeline can act on without a judgment call. Drift has its own gate —
  // `anchor-resolve` exits non-zero on it, against a repo root the caller
  // named, which is the run a CI pipeline should be making anyway.
  failsWhen: (result, input) =>
    input.strict === true &&
    (result as KbDoctorCommandResult).counts.expired > 0,
});

/**
 * The summary table first, then only the groups that found something.
 *
 * The table carries every check including the empty ones — that is what makes
 * "checked and clean" legible — while the detail below stays as short as the
 * base's actual health.
 */
function render(result: KbDoctorCommandResult): string {
  const { thresholds } = result;
  const lines = [
    `# KB Doctor — ${result.bundlePath}`,
    `records: ${result.recordCount}`,
    `thresholds: expiring within ${thresholds.expiringDays}d, unverified over ${thresholds.unverifiedDays}d, aging over ${thresholds.agingDays}d`,
    `checked: ${result.checkedAt}`,
    ...(result.anchorResolvers.total
      ? [
          `anchors: ${result.anchorResolvers.total} hashed — ${result.anchorResolvers.treeSitter} tree-sitter, ${result.anchorResolvers.regex} regex`,
        ]
      : []),
    "",
  ];

  const width = Math.max(...result.groups.map((group) => group.check.length));
  for (const group of result.groups) {
    lines.push(
      `  ${group.check.padEnd(width)}  ${String(group.count).padStart(3)}  ${group.headline}`,
    );
  }

  for (const group of result.groups) {
    if (!group.count) continue;
    lines.push("", `## ${group.check} (${group.count})`);
    for (const found of group.findings) {
      lines.push(
        `- ${found.conceptId}${found.title ? ` — ${found.title}` : ""}: ${found.note}`,
      );
    }
  }

  lines.push(
    "",
    result.healthy
      ? "Nothing to repair."
      : `${result.findingCount} finding${result.findingCount === 1 ? "" : "s"} across ${
          result.groups.filter((group) => group.count).length
        } of ${result.groups.length} checks.`,
  );

  return lines.join("\n");
}
