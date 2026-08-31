import { z } from "zod";
import {
  doctor,
  DEFAULT_AGING_DAYS,
  DEFAULT_EXPIRING_DAYS,
  DEFAULT_UNVERIFIED_DAYS,
  type KbDoctorReport,
} from "../doctor.js";
import { argvFlag, bundlePath, define } from "./model.js";

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
    "doctor [--expiring-days N] [--unverified-days N] [--aging-days N] [--strict]",
  description:
    "A health sweep over a whole base: what the calendar has already retired, what nobody ever confirmed, what has been open or proposed long enough that the status is now the answer, and what the graph has dropped on the floor. Read-only — it never writes, never supersedes, and never re-dates anything; every finding names a record for a person to repair. Seven checks, grouped and counted: expired (past `stale_after`), expiring (inside the window), unverified (an empty `verified[]` on a record old enough to matter), aging (still `open` or `proposed`), orphaned (no other record links to it), broken supersession (a chain that does not resolve), and superseded-but-cited (a live record whose body links to a record that no longer holds). Every group is reported even when empty, because a check that found nothing and a check that never ran look identical in a report that only lists findings.\n\nThis is the question no reader thinks to ask, which is why it needs a command: decay is invisible from inside a single record — a stale one reads exactly like a live one, and a question nobody answered reads exactly like one nobody asked. Reach for it when picking up a base someone else kept, before trusting a base you have not touched in months, or on a schedule; kb_validate is the narrower neighbour, checking only whether pointers between records agree.",
  input: z.object({
    bundlePath,
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
  fromArgv: (argv, path) => {
    const expiring = argvFlag(argv, "--expiring-days");
    const unverified = argvFlag(argv, "--unverified-days");
    const agingDays = argvFlag(argv, "--aging-days");
    return {
      bundlePath: path,
      ...(expiring ? { expiringDays: Number(expiring) } : {}),
      ...(unverified ? { unverifiedDays: Number(unverified) } : {}),
      ...(agingDays ? { agingDays: Number(agingDays) } : {}),
      ...(argv.includes("--strict") ? { strict: true } : {}),
    };
  },
  run: async (
    { store, now },
    { bundlePath: path, expiringDays, unverifiedDays, agingDays },
  ) => {
    const checkedAt = now();
    const report = doctor(await store.list(path), {
      ...(expiringDays !== undefined ? { expiringDays } : {}),
      ...(unverifiedDays !== undefined ? { unverifiedDays } : {}),
      ...(agingDays !== undefined ? { agingDays } : {}),
      now: new Date(checkedAt),
    });
    return { bundlePath: path, checkedAt, ...report };
  },
  render: (result) => render(result as KbDoctorCommandResult),
  // Only expiry, and only under --strict. The other six checks report debt a
  // reader decides about; an expired record is the base asserting something it
  // already said it would stop standing behind, which is the one finding a
  // pipeline can act on without a judgment call.
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
