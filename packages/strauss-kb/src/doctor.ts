import { adjudicate, type KbStanding } from "./adjudicate.js";
import type { KbAnchorDriftEntry } from "./anchor-resolver.js";
import { edgeNeighbours } from "./kb-edges.js";
import type { KbRecord, KbRecordStatus } from "./kb-record.schema.js";
import { validateBundle } from "./validate.js";

/**
 * A health sweep over a whole base — read-only, and never a mutation.
 *
 * Every other read answers a question a caller already had. This one asks the
 * questions nobody thinks to: which records the calendar has already retired,
 * which nobody ever confirmed, which have been open long enough that "open" is
 * now the answer, and which the graph has quietly dropped on the floor. Those
 * decay silently, because a stale record reads exactly like a live one and a
 * question nobody answered reads exactly like one nobody asked.
 *
 * Grouped and counted rather than merged into one list: the eight checks are
 * eight different repairs — re-verify, re-date, answer, link, supersede, or
 * re-anchor — and a flat list of "problems" would leave the reader sorting
 * them again.
 *
 * Every group is emitted even when empty. A check that found nothing and a
 * check that never ran look identical in a report that only lists findings,
 * and the difference is the whole value of a sweep.
 */

export const DEFAULT_EXPIRING_DAYS = 30;
export const DEFAULT_UNVERIFIED_DAYS = 90;
export const DEFAULT_AGING_DAYS = 90;

export const KB_DOCTOR_CHECKS = [
  "expired",
  "expiring",
  "unverified",
  "aging",
  "orphaned",
  "broken-supersession",
  "superseded-but-cited",
  "drifted",
] as const;

export type KbDoctorCheck = (typeof KB_DOCTOR_CHECKS)[number];

/** What each check looks for, in the words the report prints. */
const CHECK_HEADLINES: Record<KbDoctorCheck, string> = {
  expired: "past its stale_after date",
  expiring: "stale_after falls within the window",
  unverified: "nobody has ever confirmed it, and it is old enough to matter",
  aging: "still open or still proposed long after it was written",
  orphaned: "no other record links to it",
  "broken-supersession": "the supersession pointers do not resolve",
  "superseded-but-cited":
    "a live record's body links to one that no longer holds",
  drifted: "the code an anchor points at moved out from under its hash",
};

export type KbDoctorFinding = {
  conceptId: string;
  title: string | null;
  status: KbRecordStatus;
  /** Why this record is in this group, in one phrase a reader can act on. */
  note: string;
};

export type KbDoctorGroup = {
  check: KbDoctorCheck;
  /** What the check looks for, so a zero count still says something. */
  headline: string;
  count: number;
  findings: KbDoctorFinding[];
};

export type KbDoctorThresholds = {
  expiringDays: number;
  unverifiedDays: number;
  agingDays: number;
};

export type KbDoctorReport = {
  recordCount: number;
  thresholds: KbDoctorThresholds;
  counts: Record<KbDoctorCheck, number>;
  /** All eight, in `KB_DOCTOR_CHECKS` order, empty ones included. */
  groups: KbDoctorGroup[];
  findingCount: number;
  healthy: boolean;
};

export type KbDoctorOptions = {
  /** How far ahead `expiring` looks. */
  expiringDays?: number;
  /** How old an unconfirmed record must be before `unverified` reports it. */
  unverifiedDays?: number;
  /** How long `open` or `proposed` may stand before `aging` reports it. */
  agingDays?: number;
  now?: Date;
  /**
   * Anchor drift, precomputed by the caller. `doctor` stays pure and sync for
   * the same reason `adjudicate` does — the filesystem work of re-resolving
   * anchors belongs to `detectAnchorDrift`, and a sweep with no map simply
   * reports the `drifted` check as clean rather than half-running it.
   */
  anchorDrift?: Map<string, KbAnchorDriftEntry[]>;
};

const DAY_MS = 86_400_000;

export function doctor(
  bundle: KbRecord[],
  options: KbDoctorOptions = {},
): KbDoctorReport {
  const thresholds: KbDoctorThresholds = {
    expiringDays: options.expiringDays ?? DEFAULT_EXPIRING_DAYS,
    unverifiedDays: options.unverifiedDays ?? DEFAULT_UNVERIFIED_DAYS,
    agingDays: options.agingDays ?? DEFAULT_AGING_DAYS,
  };
  const now = options.now ?? new Date();

  const adjudicated = adjudicate(bundle, bundle, now, options.anchorDrift);
  const standings = new Map<string, KbStanding>(
    adjudicated.map((hit) => [hit.record.conceptId, hit.standing]),
  );
  // Superseded and rejected records are already out of force: a replaced
  // record whose date has passed needs no repair, and reporting one would
  // bury the records that do.
  const inForce = adjudicated.filter(
    (hit) => hit.standing !== "superseded" && hit.standing !== "rejected",
  );

  const groups: KbDoctorGroup[] = [
    group("expired", expired(inForce, now)),
    group("expiring", expiring(inForce, now, thresholds.expiringDays)),
    group("unverified", unverified(inForce, now, thresholds.unverifiedDays)),
    group("aging", aging(inForce, now, thresholds.agingDays)),
    group("orphaned", orphaned(bundle)),
    group("broken-supersession", brokenSupersession(bundle, adjudicated)),
    group("superseded-but-cited", supersededButCited(bundle, standings)),
    group("drifted", drifted(inForce)),
  ];

  const counts = Object.fromEntries(
    groups.map((entry) => [entry.check, entry.count]),
  ) as Record<KbDoctorCheck, number>;
  const findingCount = groups.reduce((total, entry) => total + entry.count, 0);

  return {
    recordCount: bundle.length,
    thresholds,
    counts,
    groups,
    findingCount,
    healthy: findingCount === 0,
  };
}

function group(
  check: KbDoctorCheck,
  findings: KbDoctorFinding[],
): KbDoctorGroup {
  return {
    check,
    headline: CHECK_HEADLINES[check],
    count: findings.length,
    findings,
  };
}

/**
 * An unreadable `stale_after` counts as expired rather than being skipped.
 * A date nobody can parse is a date nobody can trust, and treating it as
 * absent would silently exempt the record from the only check that ages it.
 *
 * `stale_after` is written date-only, which `Date.parse` reads as UTC
 * midnight — so a record goes stale at the start of its date, and a sweep run
 * at 00:00:00Z on that very date still counts it as expiring rather than
 * expired. That is `adjudicate`'s comparison, not a second one: two readings
 * of the same field disagreeing about the day would be worse than either.
 */
function expired(
  hits: ReturnType<typeof adjudicate>,
  now: Date,
): KbDoctorFinding[] {
  const findings: KbDoctorFinding[] = [];
  for (const hit of hits) {
    const raw = hit.record.frontmatter.stale_after;
    if (!raw) continue;
    const at = Date.parse(raw);
    if (Number.isNaN(at)) {
      findings.push(
        finding(hit.record, `stale_after "${raw}" is not a readable date`),
      );
      continue;
    }
    if (at < now.getTime()) {
      findings.push(
        finding(
          hit.record,
          `stale since ${raw} (${daysBetween(at, now.getTime())} days ago)`,
        ),
      );
    }
  }
  return findings;
}

function expiring(
  hits: ReturnType<typeof adjudicate>,
  now: Date,
  withinDays: number,
): KbDoctorFinding[] {
  const horizon = now.getTime() + withinDays * DAY_MS;
  const findings: KbDoctorFinding[] = [];
  for (const hit of hits) {
    const raw = hit.record.frontmatter.stale_after;
    if (!raw) continue;
    const at = Date.parse(raw);
    if (Number.isNaN(at) || at < now.getTime() || at > horizon) continue;
    findings.push(
      finding(
        hit.record,
        `goes stale ${raw} (in ${daysBetween(now.getTime(), at)} days)`,
      ),
    );
  }
  return findings;
}

/**
 * Age is read from `generated.at`, so a record carrying no timestamp is not
 * reported: this check is about how long something has gone unconfirmed, and
 * without a start there is no duration. `kb_query` still warns `unverified` on
 * every such record at read time, which is where the timeless case belongs.
 */
function unverified(
  hits: ReturnType<typeof adjudicate>,
  now: Date,
  olderThanDays: number,
): KbDoctorFinding[] {
  const findings: KbDoctorFinding[] = [];
  for (const hit of hits) {
    if (hit.record.frontmatter.verified?.length) continue;
    const age = ageInDays(hit.record, now);
    if (age === null || age <= olderThanDays) continue;
    findings.push(
      finding(hit.record, `never verified, written ${age} days ago`),
    );
  }
  return findings;
}

/**
 * One group for both spellings of the same decay. An `open` question and a
 * `proposed` decision are the same debt — something was raised and never
 * settled — and splitting them would make the reader check two places for one
 * repair.
 */
function aging(
  hits: ReturnType<typeof adjudicate>,
  now: Date,
  olderThanDays: number,
): KbDoctorFinding[] {
  const findings: KbDoctorFinding[] = [];
  for (const hit of hits) {
    const status = hit.record.frontmatter.strauss_status;
    if (status !== "open" && status !== "proposed") continue;
    const age = ageInDays(hit.record, now);
    if (age === null || age <= olderThanDays) continue;
    findings.push(
      finding(
        hit.record,
        status === "open"
          ? `open for ${age} days`
          : `proposed ${age} days ago and still unsettled`,
      ),
    );
  }
  return findings.sort((left, right) =>
    left.conceptId.localeCompare(right.conceptId),
  );
}

/**
 * Incoming edges only, and over every record whatever its standing.
 *
 * "Links to" is directional: a record that cites five others and is cited by
 * none is precisely the island this names — reachable if you already know it
 * exists, which is the thing nobody does. Standing is not a filter here
 * because the question is about the graph, not about force: a rejected record
 * nothing points at is as lost as a current one.
 *
 * Supersession is read in one direction only — the replacement references what
 * it replaced, never the other way. `kb-edges` deliberately reports the pair
 * symmetrically, which is right for a walk and wrong here: taken symmetrically,
 * a dead record vouches for its own replacement, so an old→new pair nothing
 * else touches would rescue itself and never report. Read one way, the
 * replaced record stays reachable through its history and the replacement has
 * to earn its own inbound link.
 */
function orphaned(bundle: KbRecord[]): KbDoctorFinding[] {
  const present = new Set(bundle.map((record) => record.conceptId));
  const referenced = new Set<string>();
  for (const record of bundle) {
    for (const neighbour of edgeNeighbours(record, bundle, "body-link")) {
      referenced.add(neighbour.conceptId);
    }
    // Both spellings of one statement — "X replaced R" — whichever side of the
    // pair stores it. Either way it is X that references R.
    for (const replaced of record.frontmatter.strauss_supersedes ?? []) {
      referenced.add(replaced);
    }
    const replacement = record.frontmatter.strauss_superseded_by;
    if (replacement && present.has(replacement)) {
      referenced.add(record.conceptId);
    }
  }
  return bundle
    .filter((record) => !referenced.has(record.conceptId))
    .map((record) => finding(record, "no other record links to it"));
}

/**
 * The cross-record supersession checks `validate` already owns, plus the two
 * shapes only a chain walk can see: a cycle, and a fork where two records both
 * claim to replace one. Re-deriving the first set here would give the two
 * commands room to disagree about what a broken chain is.
 *
 * "Superseded with nothing surviving" is not a third clause: a chain ends
 * empty only when a pointer is absent, missing, or cyclic, and all three are
 * already reported above — a second phrasing of the same defect would read as
 * two problems to repair.
 */
const SUPERSESSION_CHECKS = new Set([
  "superseded_by",
  "supersedes",
  "backlink",
]);

function brokenSupersession(
  bundle: KbRecord[],
  adjudicated: ReturnType<typeof adjudicate>,
): KbDoctorFinding[] {
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  const findings: KbDoctorFinding[] = [];
  const seen = new Set<string>();
  const add = (record: KbRecord, note: string) => {
    const key = `${record.conceptId}\u0000${note}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding(record, note));
  };

  for (const problem of validateBundle(bundle)) {
    if (!SUPERSESSION_CHECKS.has(problem.check)) continue;
    const record = byId.get(problem.conceptId);
    if (record) add(record, problem.note);
  }

  // Both `validate` and the chain walk below reach a `strauss_superseded_by`
  // only through a record whose status is already `superseded` — so a record
  // left `accepted` while pointing at a replacement is invisible to both, and
  // adjudication reads it as current no matter what the pointer says. That is
  // precisely the hand-edit this check exists for: the store writes the status
  // and the pointer in one mutation, so the two can only disagree off-tool.
  for (const record of bundle) {
    const replacement = record.frontmatter.strauss_superseded_by;
    if (!replacement) continue;
    if (!byId.has(replacement)) {
      add(record, `replacement ${replacement} is missing`);
    } else if (record.frontmatter.strauss_status !== "superseded") {
      add(
        record,
        `names ${replacement} as its replacement but is not marked superseded`,
      );
    }
  }

  for (const hit of adjudicated) {
    for (const warning of hit.warnings) {
      if (warning.kind === "broken-chain") {
        add(hit.record, `replacement ${warning.missing} is missing`);
      } else if (warning.kind === "chain-cycle") {
        add(
          hit.record,
          `supersession chain cycles through ${warning.through.join(" → ")}`,
        );
      } else if (warning.kind === "forked-chain") {
        add(
          hit.record,
          `two records claim to replace it: ${warning.heads.join(", ")}`,
        );
      }
    }
  }

  return findings.sort((left, right) =>
    left.conceptId.localeCompare(right.conceptId),
  );
}

/**
 * A live record whose body points at a record that no longer holds.
 *
 * The most quietly wrong state in a base: the citing record is current, so a
 * reader trusts it, and the link reads as support for a claim its target has
 * already stopped making. One finding per pair, because each is its own edit.
 *
 * Rejected targets count as well as superseded ones. The check's name is for
 * the common case, but the failure is "cites something that no longer holds",
 * and a live record citing a rejected one is the worse half — a superseded
 * record at least names its replacement, while a rejected one is a well-formed
 * assertion of what someone decided *not* to do.
 *
 * A record citing the very record it replaced is exempt. That link is the
 * history working as designed — `relatedConceptIds` on a superseding write
 * renders as exactly this edge — and reporting it would put a finding on every
 * correctly performed supersession.
 */
function supersededButCited(
  bundle: KbRecord[],
  standings: Map<string, KbStanding>,
): KbDoctorFinding[] {
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  const findings: KbDoctorFinding[] = [];
  for (const record of bundle) {
    const standing = standings.get(record.conceptId);
    if (standing === "superseded" || standing === "rejected") continue;
    for (const target of edgeNeighbours(record, bundle, "body-link")) {
      const targetStanding = standings.get(target.conceptId);
      if (targetStanding !== "superseded" && targetStanding !== "rejected") {
        continue;
      }
      if (replaces(record, target)) continue;
      const replacement = target.frontmatter.strauss_superseded_by;
      findings.push(
        finding(
          record,
          `cites ${targetStanding} ${target.conceptId}${
            targetStanding === "superseded" &&
            replacement &&
            byId.has(replacement)
              ? ` — replaced by ${replacement}`
              : ""
          }`,
        ),
      );
    }
  }
  return findings;
}

/**
 * Records whose anchors no longer resolve to the code they were hashed
 * against — read off the `drifted` warning `adjudicate` already attaches, so
 * the sweep and every read path agree about what drift is. Recomputing the
 * comparison here would give the two room to disagree.
 *
 * In-force records only. A superseded record anchoring code that has since
 * moved is the expected outcome of it being replaced, not a repair.
 *
 * Unresolvable anchors ride in this group rather than a ninth check: the repair
 * is the same edit, and the note says which happened.
 */
function drifted(hits: ReturnType<typeof adjudicate>): KbDoctorFinding[] {
  const findings: KbDoctorFinding[] = [];
  for (const hit of hits) {
    const warning = hit.warnings.find((entry) => entry.kind === "drifted");
    if (!warning) continue;
    findings.push(
      finding(
        hit.record,
        `${warning.anchors.length} ${
          warning.anchors.length === 1
            ? "anchor no longer matches"
            : "anchors no longer match"
        }: ${warning.anchors
          .map((anchor) => {
            const at = anchor.symbol
              ? `${anchor.file}:${anchor.symbol}`
              : anchor.file;
            if (anchor.reason) return `${at} (${anchor.reason})`;
            if (anchor.diffSize === null) {
              return `${at} (changed, size unrecorded)`;
            }
            // A same-size rewrite is the drift most worth naming plainly:
            // "0 lines apart" reads as "nothing happened".
            return anchor.diffSize === 0
              ? `${at} (content changed, same line count)`
              : `${at} (${anchor.diffSize} line${anchor.diffSize === 1 ? "" : "s"} apart)`;
          })
          .join(", ")}`,
      ),
    );
  }
  return findings.sort((left, right) =>
    left.conceptId.localeCompare(right.conceptId),
  );
}

/** Either pointer saying `later` is what stands in `earlier`'s place. */
function replaces(later: KbRecord, earlier: KbRecord): boolean {
  return (
    (later.frontmatter.strauss_supersedes ?? []).includes(earlier.conceptId) ||
    earlier.frontmatter.strauss_superseded_by === later.conceptId
  );
}

function finding(record: KbRecord, note: string): KbDoctorFinding {
  return {
    conceptId: record.conceptId,
    title: record.frontmatter.title ?? null,
    status: record.frontmatter.strauss_status,
    note,
  };
}

/** Whole days between two instants, never negative. */
function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

function ageInDays(record: KbRecord, now: Date): number | null {
  const at = record.frontmatter.generated?.at;
  if (!at) return null;
  const written = Date.parse(at);
  if (Number.isNaN(written)) return null;
  return daysBetween(written, now.getTime());
}
