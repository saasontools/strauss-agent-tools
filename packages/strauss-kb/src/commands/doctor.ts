import { z } from "zod";
import { adjudicate } from "../adjudicate.js";
import {
  movedSearch,
  reassessPacket,
  type KbReassessPacket,
} from "../drift/index.js";
import {
  doctor,
  DEFAULT_AGING_DAYS,
  DEFAULT_EXPIRING_DAYS,
  DEFAULT_UNVERIFIED_DAYS,
  type KbDoctorReport,
} from "../doctor.js";
import { renderReassess } from "./reassess.js";
import { grammarHints } from "../grammars/index.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "./model.js";

export type KbDoctorCommandResult = KbDoctorReport & {
  bundlePath: string;
  checkedAt: string;
  /**
   * One per drifted record that still needs a reading, present only under
   * `--drifted`. Records whose every drifted anchor was `moved` or `cosmetic`
   * produce no packet — that is the classification earning its keep.
   */
  packets?: KbReassessPacket[];
  /**
   * Records carrying an anchor whose code turned up unchanged elsewhere.
   * `doctor` never writes, so it names them and stops; `kb_reassess <id>` is
   * the verb that moves the anchor.
   */
  rebaselinable?: string[];
  /** What to do about a grammar this run could not obtain. */
  hints?: string[];
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
    "doctor [--expiring-days N] [--unverified-days N] [--aging-days N] [--repo-root PATH] [--offline] [--strict] [--drifted [--with-diff]]",
  description:
    "Read-only health sweep: expired, expiring, unverified, aging, orphaned, broken-supersession, superseded-but-cited, drifted and unchecked anchors. Every group is reported even when empty; nothing is written or re-stamped. `drifted` narrows it to a reassessment packet per drifted record, `with_diff` adding each anchor's old-vs-new span.",
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
    offline: z
      .boolean()
      .optional()
      .describe(
        "Read foreign anchors from the local repo cache only, never fetching.",
      ),
    strict: z
      .boolean()
      .optional()
      .describe(
        "Turn an expired record into a non-zero exit for the CLI. No effect on the report itself.",
      ),
    drifted: z
      .boolean()
      .optional()
      .describe(
        "Report only drift, as a reassessment packet per record: claim, per-anchor class, and what depends on it.",
      ),
    withDiff: z
      .boolean()
      .optional()
      .describe(
        "With `drifted`: recover each anchor's committed span and render the old-vs-new diff. Reads git history.",
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
      ...(argv.includes("--offline") ? { offline: true } : {}),
      ...(argv.includes("--strict") ? { strict: true } : {}),
      ...(argv.includes("--drifted") ? { drifted: true } : {}),
      ...(argv.includes("--with-diff") ? { withDiff: true } : {}),
    };
  },
  run: async (
    { store, now },
    {
      bundlePath: path,
      expiringDays,
      unverifiedDays,
      agingDays,
      repoRoot,
      offline,
      drifted,
      withDiff,
    },
  ) => {
    const checkedAt = now();
    const records = await store.list(path);
    // Read-only, like every other check here: the sweep names the drifted
    // anchors and leaves the re-stamp to `anchor-resolve`, which is the verb
    // that writes.
    const anchorDrift = await store.detectDrift(records, repoRoot, {
      offline: offline === true,
    });
    const report = doctor(records, {
      ...(expiringDays !== undefined ? { expiringDays } : {}),
      ...(unverifiedDays !== undefined ? { unverifiedDays } : {}),
      ...(agingDays !== undefined ? { agingDays } : {}),
      ...(anchorDrift !== undefined ? { anchorDrift } : {}),
      now: new Date(checkedAt),
    });
    const hints = grammarHints();
    if (!drifted) {
      return {
        bundlePath: path,
        checkedAt,
        ...report,
        ...(hints.length ? { hints } : {}),
      };
    }

    // Read-only, like the rest of the sweep: packets are built, `moved`
    // anchors are named, and not one anchor is rewritten.
    const standings = new Map(
      adjudicate(records, records, new Date(checkedAt)).map((hit) => [
        hit.record.conceptId,
        hit.standing,
      ]),
    );
    const packets: KbReassessPacket[] = [];
    const rebaselinable: string[] = [];
    // One search for the whole sweep: the repository is listed once, and a
    // candidate file is parsed once however many records anchor into it.
    const search = movedSearch(repoRoot ?? process.cwd());
    for (const found of report.groups.find((g) => g.check === "drifted")
      ?.findings ?? []) {
      const record = records.find(
        (entry) => entry.conceptId === found.conceptId,
      );
      if (!record) continue;
      const standing = standings.get(record.conceptId);
      const built = await reassessPacket(
        repoRoot ?? process.cwd(),
        record,
        anchorDrift?.get(record.conceptId) ?? [],
        {
          ...(withDiff ? { withDiff: true } : {}),
          impact: await store.impact(path, record.conceptId),
          ...(standing ? { standing } : {}),
          search,
        },
      );
      if (built.packet) packets.push(built.packet);
      if (built.classified.some((entry) => entry.class === "moved")) {
        rebaselinable.push(record.conceptId);
      }
    }
    return {
      bundlePath: path,
      checkedAt,
      ...report,
      packets,
      rebaselinable,
      ...(hints.length ? { hints } : {}),
    };
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
  if (result.packets) return renderPackets(result);
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

  for (const hint of result.hints ?? []) lines.push("", hint);

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

/**
 * `--drifted` answers a different question from the sweep, so it prints a
 * different report: not "what is wrong with this base" but "here is what to
 * read, and what the code did".
 */
function renderPackets(result: KbDoctorCommandResult): string {
  const packets = result.packets ?? [];
  const lines = [
    `# KB Drift — ${result.bundlePath}`,
    `checked: ${result.checkedAt}`,
    `${packets.length} record${packets.length === 1 ? "" : "s"} need a reading; ${
      result.counts.drifted
    } drifted in all.`,
  ];
  if (result.rebaselinable?.length) {
    lines.push(
      `moved, rebaseline with \`kb_reassess\`: ${result.rebaselinable.join(", ")}`,
    );
  }
  for (const packet of packets) {
    lines.push(
      renderReassess({
        conceptId: packet.conceptId,
        packet,
        rebaselined: [],
        cosmetic: 0,
      }),
    );
  }
  return lines.join("\n");
}
