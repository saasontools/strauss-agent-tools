import { createHash } from "node:crypto";
import {
  appendFile,
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  parseMarkdownWithFrontmatter,
  stringifyMarkdownWithFrontmatter,
} from "./markdown.js";
import {
  kbRecordFrontmatterSchema,
  kbVerifiedEventSchema,
  KB_SLUG_PATTERN,
  type KbRecord,
  type KbRecordFrontmatter,
  type KbRecordStatus,
} from "./kb-record.schema.js";
import {
  KbInvalidConceptIdError,
  KbRecordAlreadyExistsError,
  KbRecordNotFoundError,
  KbSelfVerificationError,
  KbWriteConflictError,
} from "./kb-errors.js";
import { INDEX_FILE, indexIsStale, renderIndex } from "./kb-index.js";
import { adjudicate, type KbAdjudicated } from "./adjudicate.js";
import { resolveHits, searchBase, SEARCH_INDEX_FILE } from "./search-index.js";
import { trace, type KbTraceOptions, type KbTraceStep } from "./trace.js";
import { pack, type KbPackOptions, type KbPackResult } from "./pack.js";
import {
  LOG_FILE,
  parseLog,
  renderLogEntry,
  type KbLogEntry,
} from "./kb-log.js";
import {
  appendUnionMergeLine,
  GITATTRIBUTES_FILE,
  hasMergeDeclaration,
} from "./kb-gitattributes.js";

/**
 * Default bundle, relative to the working directory. A scratch base lives here
 * and is meant to be gitignored; a base worth keeping is written to a committed
 * path instead, passed explicitly. Nothing promotes one to the other.
 */
export const KB_DIR = join(".strauss", "kb");

const STORE_OWNED = new Set([INDEX_FILE, LOG_FILE, SEARCH_INDEX_FILE]);

export type KbLogger = {
  info?(entry: Record<string, unknown>): void;
  warn?(entry: Record<string, unknown>): void;
};

/** Roughly an eighth of a large context window — generous, and overridable. */
export const DEFAULT_LOAD_BUDGET = 25_000;

/**
 * A superseded record, named but not spelled out.
 *
 * Standing is a qualifier on a body, and over a long session the body outlives
 * the qualifier — the reader keeps what the record said and loses that it no
 * longer holds. A stub has nothing left to act on, so the failure cannot occur,
 * and `trace` still reaches the content through the id.
 */
export type KbSupersededStub = {
  conceptId: string;
  title: string | null;
  supersededBy: string[];
  at: string | null;
};

export type KbLoadResult =
  | {
      loaded: true;
      records: KbAdjudicated[];
      /** Named only. Their bodies are reachable through `trace`. */
      superseded: KbSupersededStub[];
      recordCount: number;
      tokensLoaded: number;
      /** `null` when loaded via `all`: no ceiling was applied. */
      budgetTokens: number | null;
    }
  | {
      loaded: false;
      recordCount: number;
      approxTokens: number;
      budgetTokens: number;
    };

export type KbWriteInput = {
  type: string;
  slug: string;
  frontmatter: Omit<KbRecordFrontmatter, "type">;
  body: string;
  /** Replace an existing record rather than failing on the collision. */
  overwrite?: boolean;
};

export type KbWriteResult = KbRecord & {
  /** Whether this write also marked prior records superseded. */
  action: "created" | "superseded-prior";
  /** `frontmatter.strauss_supersedes` ids that were actually marked. */
  supersededIds: string[];
};

/**
 * Reads and writes a knowledge bundle.
 *
 * One record per file, deliberately. Several agents run in parallel against the
 * same bundle, and a shared file would need merging — a file-per-record store
 * has no write conflict to resolve, only distinct filenames to choose.
 *
 * The bundle is addressed by path rather than fixed to one directory. A base
 * belongs to whatever prompted it — a worktree, an investigation, a document —
 * and one hardcoded location cannot be all of those.
 *
 * Framework-free on purpose. The consumers are a library caller, a CLI an agent
 * shells out to, and an MCP server; the store takes a logger rather than
 * reaching for one, because only some of those have anything to reach into.
 */
export class KbStore {
  constructor(private readonly logger: KbLogger = {}) {}

  /**
   * Writes one record. `type` and `slug` compose both the filename and the
   * concept id, so a caller cannot produce a file whose identity disagrees with
   * its contents.
   */
  async write(
    bundlePath: string,
    input: KbWriteInput,
    actor = "unknown",
  ): Promise<KbWriteResult> {
    if (!KB_SLUG_PATTERN.test(input.slug)) {
      throw new KbInvalidConceptIdError("slug must be kebab-case", {
        slug: input.slug,
      });
    }
    if (!KB_SLUG_PATTERN.test(input.type)) {
      throw new KbInvalidConceptIdError("type must be kebab-case", {
        type: input.type,
      });
    }

    const frontmatter = kbRecordFrontmatterSchema.parse({
      ...input.frontmatter,
      type: input.type,
    });
    const conceptId = `${input.type}.${input.slug}`;
    const root = this.root(bundlePath);
    const target = this.recordPath(bundlePath, conceptId);

    await mkdir(root, { recursive: true });
    await this.publish(
      target,
      stringifyMarkdownWithFrontmatter(input.body, frontmatter),
      input.overwrite ?? false,
      conceptId,
    );

    await this.record(root, {
      operation: input.overwrite ? "overwrite" : "write",
      conceptId,
      by: actor,
    });

    // The new record is published and logged first, then each prior record it
    // supersedes is marked in turn. A crash between the two leaves an old
    // record with no backlink — exactly what kb_validate already reports as
    // "<old> is not marked superseded", never a silent drift.
    //
    // Naming itself is a no-op, not an error — the record is already itself.
    // Duplicates collapse through the Set, so a repeated id marks once.
    const targets = new Set(frontmatter.strauss_supersedes ?? []);
    targets.delete(conceptId);

    const supersededIds: string[] = [];
    for (const old of targets) {
      if (
        await this.markSupersededRetrying(bundlePath, old, conceptId, actor)
      ) {
        supersededIds.push(old);
      }
    }

    this.logger.info?.({
      operation: "kb.write",
      bundlePath: root,
      conceptId,
      anchors: frontmatter.strauss_anchors?.length ?? 0,
    });

    return {
      conceptId,
      frontmatter,
      body: input.body,
      action: supersededIds.length ? "superseded-prior" : "created",
      supersededIds,
    };
  }

  /** One record by concept id, or null when it does not exist. */
  async read(bundlePath: string, conceptId: string): Promise<KbRecord | null> {
    // Resolved outside the try: the `catch` exists to turn a missing file into
    // `null`, and must not also swallow the concept-id validation below it.
    const target = this.recordPath(bundlePath, conceptId);
    let raw: string;
    try {
      raw = await readFile(target, "utf8");
    } catch {
      return null;
    }
    return this.parse(conceptId, raw);
  }

  /**
   * Every record in the bundle, optionally narrowed to one type.
   *
   * A file that fails to parse is skipped and logged rather than thrown: one
   * malformed record — hand-edited, or written by a producer we don't know —
   * must not make the whole bundle unreadable.
   */
  async list(bundlePath: string, type?: string): Promise<KbRecord[]> {
    const root = this.root(bundlePath);
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      return [];
    }

    // The type filter runs on the filename, so a narrowed list never opens a
    // record it is going to discard. What remains is read concurrently: the
    // cost here is per-file syscall latency, not CPU.
    const wanted = names
      .sort()
      // Both store-owned files are markdown and neither is a record; without
      // this they parse to null and are dropped, but not before logging a
      // warning that says the bundle contains a malformed record.
      .filter((name) => name.endsWith(".md") && !STORE_OWNED.has(name))
      .map((name) => ({ name, conceptId: name.slice(0, -".md".length) }))
      .filter(({ conceptId }) => !type || conceptId.startsWith(`${type}.`));

    const records = await Promise.all(
      wanted.map(async ({ name, conceptId }) =>
        this.parse(conceptId, await readFile(join(root, name), "utf8")),
      ),
    );
    return records.filter((record): record is KbRecord => record !== null);
  }

  /**
   * Moves a record's status, preserving everything else.
   *
   * Read-modify-write on one file is the one place two agents genuinely race,
   * and the fix is a compare-and-swap rather than a lock: hash on read, verify
   * the file is unchanged immediately before writing, fail if it moved. A lock
   * would buy the same guarantee and add a stale-lock failure mode — a writer
   * killed mid-hold blocks every later one until someone reasons about
   * timeouts.
   */
  async setStatus(
    bundlePath: string,
    conceptId: string,
    status: KbRecordStatus,
    actor = "unknown",
  ): Promise<KbRecord> {
    return this.mutate(
      bundlePath,
      conceptId,
      (frontmatter) => ({ ...frontmatter, strauss_status: status }),
      { operation: `status:${status}`, by: actor },
    );
  }

  /**
   * Appends one `verified[]` event: who checked the record, when, and what the
   * check found. Append-only — prior events are history, and are spread into
   * the new array untouched rather than reshaped through the write schema.
   *
   * A record's generator cannot verify its own record unless the actor is
   * human: the generator re-reading its own output is not an independent
   * check. The rule runs before the mutation so a refusal never publishes,
   * and the refusal is logged under its own operation name — `mutate` only
   * logs what it publishes.
   */
  async verify(
    bundlePath: string,
    conceptId: string,
    note: string,
    actor = "unknown",
    at = new Date().toISOString(),
  ): Promise<KbRecord> {
    const event = kbVerifiedEventSchema.parse({ by: actor, at, note });

    const existing = await this.read(bundlePath, conceptId);
    if (!existing) throw new KbRecordNotFoundError(conceptId);

    // The equality test compares whole actors case-insensitively: case drift
    // (`agent:Claude` vs `agent:claude`) must not mint a distinct verifier
    // identity. Only the `human:` exemption keeps the prefix-only
    // normalization.
    const generatedBy = existing.frontmatter.generated?.by;
    if (
      generatedBy !== undefined &&
      actor.toLowerCase() === generatedBy.toLowerCase() &&
      !normalizeActor(actor).startsWith("human:")
    ) {
      await this.record(this.root(bundlePath), {
        operation: "verify:refused",
        conceptId,
        by: actor,
      });
      throw new KbSelfVerificationError(conceptId, actor, generatedBy);
    }

    return this.mutate(
      bundlePath,
      conceptId,
      (frontmatter) => ({
        ...frontmatter,
        verified: [...(frontmatter.verified ?? []), event],
      }),
      { operation: "verify", by: actor },
    );
  }

  /**
   * Marks `conceptId` superseded by `replacementId`, and links both directions.
   *
   * Writing one side and letting a validator notice the other is missing was
   * the previous arrangement; doing both here means the backlink cannot drift
   * in normal use, and validation drops to catching hand-edits.
   */
  async supersede(
    bundlePath: string,
    conceptId: string,
    replacementId: string,
    actor = "unknown",
  ): Promise<KbRecord> {
    const replacement = await this.read(bundlePath, replacementId);
    if (!replacement) throw new KbRecordNotFoundError(replacementId);

    const superseded = await this.markSuperseded(
      bundlePath,
      conceptId,
      replacementId,
      actor,
    );

    await this.mutate(
      bundlePath,
      replacementId,
      (frontmatter) => ({
        ...frontmatter,
        strauss_supersedes: [
          ...new Set([...(frontmatter.strauss_supersedes ?? []), conceptId]),
        ],
      }),
      { operation: "supersedes", by: actor, target: conceptId },
    );

    return superseded;
  }

  /** Resolves an open question, stamping who answered and when. */
  async answer(
    bundlePath: string,
    conceptId: string,
    answer: string,
    actor = "unknown",
    at = new Date().toISOString(),
  ): Promise<KbRecord> {
    return this.mutate(
      bundlePath,
      conceptId,
      (frontmatter) => ({
        ...frontmatter,
        strauss_status: "resolved" as const,
        strauss_answered: { by: actor, at },
      }),
      { operation: "answer", by: actor },
      (body) => `${body.trimEnd()}\n\n## Answer\n\n${answer}\n`,
    );
  }

  /**
   * Records matching a text query, each carrying its standing.
   *
   * Relevance comes from qmd's BM25 where an index is available and from a
   * substring scan where it is not. What never moves to the ranker is the
   * adjudication below it: a ranker answers relevance, and relevance is not
   * standing — a superseded record is the older, longer, more general one, so
   * ranking alone prefers what is no longer true.
   *
   * The fallback is deliberate. A search index is an optimisation, so losing it
   * degrades recall and must never change the answer's shape or fail the call.
   */
  async query(
    bundlePath: string,
    text: string,
    options: { type?: string; includeNonCurrent?: boolean } = {},
  ): Promise<KbAdjudicated[]> {
    const bundle = await this.list(bundlePath);
    const needle = text.trim();
    const hits = needle ? await this.rank(bundlePath, needle, bundle) : bundle;
    const adjudicated = adjudicate(
      options.type
        ? hits.filter((r) => r.frontmatter.type === options.type)
        : hits,
      bundle,
    );

    if (options.includeNonCurrent) return adjudicated;
    // Superseded records are dropped only once their replacement is in the
    // result too — otherwise the caller loses the thread entirely rather than
    // being handed a newer version of it.
    const present = new Set(adjudicated.map((hit) => hit.record.conceptId));
    return adjudicated.filter(
      (hit) =>
        hit.standing !== "superseded" ||
        !hit.heads.some((head) => present.has(head.conceptId)),
    );
  }

  private async rank(
    bundlePath: string,
    needle: string,
    bundle: KbRecord[],
  ): Promise<KbRecord[]> {
    const ranked = await searchBase(this.root(bundlePath), needle, {
      logger: this.logger,
    });
    if (ranked) {
      const found = resolveHits(ranked, bundle);
      if (found.length) return found;
    }
    const lowered = needle.toLowerCase();
    return bundle.filter((record) => matches(record, lowered));
  }

  /**
   * The whole base, adjudicated, when it is small enough to hand over.
   *
   * At the sizes these reach — twenty records is about three thousand tokens —
   * loading everything beats searching it, and measurably: on nine questions
   * whose wording appears in no record, a reader holding the base answered
   * eight against an embedding search's four. Two of those differences are
   * structural. A reader can say no record answers the question; vector search
   * returns its nearest neighbour whatever the distance. And a reader picks the
   * record that answers the question rather than the one nearest the topic.
   * See the README's retrieval section for the measurements.
   *
   * Load it for a question, not for a session — a base read into a long
   * conversation is summarised away by the end of it.
   *
   * Refuses rather than truncates when the base is too large. A truncated base
   * is indistinguishable from a complete one, so a caller would answer "that
   * was never decided" from a slice it did not know was a slice.
   *
   * That refusal is the default guardrail. `all` bypasses it outright and
   * always hands back the whole bundle: an explicit, never-accidental escape
   * hatch for an operator who has the budget to spend, not a wider default.
   */
  async load(
    bundlePath: string,
    options: { budgetTokens?: number; type?: string; all?: boolean } = {},
  ): Promise<KbLoadResult> {
    const budgetTokens = options.budgetTokens ?? DEFAULT_LOAD_BUDGET;
    const bundle = await this.list(bundlePath);
    const wanted = options.type
      ? bundle.filter((record) => record.frontmatter.type === options.type)
      : bundle;

    // Adjudicated against the whole base, not the filtered slice: a record's
    // replacement may be of another type.
    const adjudicated = adjudicate(wanted, bundle);
    const records = adjudicated.filter((hit) => hit.standing !== "superseded");
    const superseded = adjudicated
      .filter((hit) => hit.standing === "superseded")
      .map(stub);

    // Measured over what is actually handed back. Costing the full bodies would
    // refuse bases that fit comfortably once the superseded ones are stubs.
    const approxTokens =
      records.reduce((total, hit) => total + estimateTokens(hit.record), 0) +
      superseded.reduce((total, entry) => total + estimateStubTokens(entry), 0);

    if (!options.all && approxTokens > budgetTokens) {
      return {
        loaded: false,
        recordCount: wanted.length,
        approxTokens,
        budgetTokens,
      };
    }

    return {
      loaded: true,
      recordCount: wanted.length,
      tokensLoaded: approxTokens,
      budgetTokens: options.all ? null : budgetTokens,
      records,
      superseded,
    };
  }

  /** How a position was arrived at, as a timeline. See `trace.ts`. */
  async trace(
    bundlePath: string,
    seedId: string,
    options: KbTraceOptions = {},
  ): Promise<KbTraceStep[]> {
    return trace(seedId, await this.list(bundlePath), options);
  }

  /** A bounded neighbourhood around one record. See `pack.ts`. */
  async pack(
    bundlePath: string,
    rootId: string,
    options: KbPackOptions = {},
  ): Promise<KbPackResult> {
    return pack(await this.list(bundlePath), rootId, options);
  }

  /**
   * The stored index, rebuilt if it disagrees with the records.
   *
   * Repair on read is what makes the lock-free write path safe: a writer whose
   * scan predated another writer's record publishes a momentarily stale index,
   * and the next reader through here settles it.
   */
  async readIndex(bundlePath: string): Promise<string> {
    const root = this.root(bundlePath);
    const expected = renderIndex(await this.list(bundlePath));
    const stored = await readFile(join(root, INDEX_FILE), "utf8").catch(
      () => null,
    );

    if (indexIsStale(stored, expected)) {
      await this.publish(join(root, INDEX_FILE), expected, true, INDEX_FILE);
      this.logger.info?.({
        operation: "kb.index.repair",
        bundlePath: root,
        reason: stored === null ? "missing" : "stale",
      });
    }
    return expected;
  }

  /**
   * The log, with unparseable lines reported rather than repaired.
   *
   * The log is the bundle's only artifact that cannot be reconstructed — the
   * records rebuild the index, and the code outlives both, but nothing else
   * knows which agent touched what. So a bad line is surfaced and left alone.
   */
  async readLog(bundlePath: string): Promise<ReturnType<typeof parseLog>> {
    const raw = await readFile(
      join(this.root(bundlePath), LOG_FILE),
      "utf8",
    ).catch(() => "");
    const result = parseLog(raw);
    for (const bad of result.malformed) {
      this.logger.warn?.({
        operation: "kb.log.parse",
        line: bad.line,
        outcome: "skipped",
      });
    }
    return result;
  }

  /**
   * `markSuperseded`, tolerant of the two ways it legitimately doesn't land:
   * a missing target (a broken link, legal per compose.ts) or a CAS conflict
   * from a concurrent writer touching the same target. A conflict is retried
   * a bounded number of times — each attempt re-reads the target fresh — and
   * on the last, `false` reports "not marked" rather than throwing: the
   * caller's own record is already published, so failing here would leave
   * that publish unreported instead of undone. kb_validate's existing
   * "not marked superseded" check is what surfaces the residue.
   */
  private async markSupersededRetrying(
    bundlePath: string,
    conceptId: string,
    replacementId: string,
    actor: string,
    retries = 3,
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.markSuperseded(bundlePath, conceptId, replacementId, actor);
        return true;
      } catch (error) {
        if (error instanceof KbRecordNotFoundError) return false;
        if (!(error instanceof KbWriteConflictError)) throw error;
        if (attempt === retries) return false;
      }
    }
    return false;
  }

  /** The one-directional half of `supersede`: marks `conceptId` superseded. */
  private async markSuperseded(
    bundlePath: string,
    conceptId: string,
    replacementId: string,
    actor: string,
  ): Promise<KbRecord> {
    return this.mutate(
      bundlePath,
      conceptId,
      (frontmatter) => ({
        ...frontmatter,
        strauss_status: "superseded" as const,
        strauss_superseded_by: replacementId,
      }),
      { operation: "supersede", by: actor, target: replacementId },
    );
  }

  private async mutate(
    bundlePath: string,
    conceptId: string,
    change: (frontmatter: KbRecordFrontmatter) => KbRecordFrontmatter,
    entry: Omit<KbLogEntry, "at" | "conceptId"> & { target?: string },
    changeBody: (body: string) => string = (body) => body,
  ): Promise<KbRecord> {
    const target = this.recordPath(bundlePath, conceptId);
    const before = await readFile(target, "utf8").catch(() => null);
    if (before === null) throw new KbRecordNotFoundError(conceptId);

    const parsed = this.parse(conceptId, before);
    if (!parsed) throw new KbRecordNotFoundError(conceptId);

    const frontmatter = change(parsed.frontmatter);
    const body = changeBody(parsed.body);
    const contents = stringifyMarkdownWithFrontmatter(body, frontmatter);

    // Optimistic check, not a hard guarantee: a writer landing between this
    // read and the publish below still wins silently. It narrows the window
    // from "the whole compose" to two adjacent syscalls, which is as far as a
    // filesystem goes without a lock — and a lock's stale-hold failure mode is
    // worse than the residue.
    const witness = await readFile(target, "utf8").catch(() => null);
    if (witness === null || digest(witness) !== digest(before)) {
      throw new KbWriteConflictError(conceptId);
    }
    await this.publish(target, contents, true, conceptId);
    await this.record(this.root(bundlePath), { ...entry, conceptId });

    return { conceptId, frontmatter, body };
  }

  /**
   * Two guarantees, both about writers running in parallel.
   *
   * The record is written to a staging file and only then published, so a
   * concurrent reader sees the whole record or no record — never half of one. A
   * plain write is not atomic, and `list()` skips what it cannot parse, so a
   * torn read would be silently reported as a malformed record.
   *
   * Publishing uses `link` rather than `rename` unless the caller asked to
   * overwrite: `link` fails with EEXIST instead of replacing, which turns "two
   * writers chose the same concept id" from silent data loss into a collision
   * the caller has to answer. Both are atomic; only `rename` clobbers.
   *
   * The staging name deliberately does not end in `.md` — `list()` would
   * otherwise try to read it mid-write.
   */
  private async publish(
    target: string,
    contents: string,
    overwrite: boolean,
    conceptId: string,
  ): Promise<void> {
    const staging = `${target}.${process.pid}.tmp`;
    await writeFile(staging, contents, "utf8");

    try {
      if (overwrite) {
        await rename(staging, target);
        return;
      }
      await link(staging, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new KbRecordAlreadyExistsError(conceptId);
      }
      throw error;
    } finally {
      // `rename` consumed the staging file; `link` left it behind.
      await unlink(staging).catch(() => undefined);
    }
  }

  /**
   * Declares union merge for the log, so two worktrees writing the same
   * bundle interleave their `log.jsonl` lines on merge rather than one
   * side's appends silently losing to git's ordinary line-level merge.
   *
   * Called from `record` — every path that appends a log line, not just
   * `write` — so a bundle only ever mutated through `setStatus`/`verify`/
   * `supersede` still gets it. There is no cheaper reliable signal for
   * "first write" than checking the file itself, and after the first call
   * the check is a no-op `readFile`.
   *
   * A missing `.gitattributes` is created outright, with `wx` (exclusive
   * create) rather than a plain write: if another process's `write()` won a
   * race and created the file between the `readFile` below and this call,
   * `wx` fails instead of truncating what that writer just wrote, and the
   * failure is swallowed by the catch below same as any other best-effort
   * miss. A file that exists but declares no merge strategy for the log
   * gets the line appended, never a wholesale rewrite; one that already
   * declares any merge strategy — this one or a user's own — is left alone
   * entirely (see `hasMergeDeclaration`).
   *
   * `readFile` failing is `existing === null` only for `ENOENT` — genuinely
   * missing. Any other error (a permission problem, a transient `EMFILE`,
   * the path being a directory) is *not* "missing" and must not fall into
   * the create branch, which would truncate whatever is actually there with
   * just the union-merge line: that is the file-destroying bug this
   * function exists to avoid, not commit. An unreadable existing file is
   * therefore left untouched and reported as a failure like any other.
   *
   * Two processes racing the append branch — both read a file without the
   * line, both append it — is possible and left unguarded: `appendFile` is
   * `O_APPEND`, so the result is two copies of the same line rather than a
   * torn write, and `hasMergeDeclaration` sees a duplicate declaration as
   * "already declared" on the next call. A cheap-to-detect, harmless-to-
   * leave residue, not a reason to add a cross-process lock (see
   * `ARCHITECTURE.md`'s rejection of one for the same trade on records).
   *
   * Best-effort, like the log append it precedes: failing to write this
   * file must not fail the mutation it guards.
   */
  private async ensureGitattributes(root: string): Promise<void> {
    const target = join(root, GITATTRIBUTES_FILE);
    try {
      let existing: string | null;
      try {
        existing = await readFile(target, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        existing = null;
      }

      if (existing === null) {
        await writeFile(target, appendUnionMergeLine(""), {
          encoding: "utf8",
          flag: "wx",
        });
        this.logger.info?.({
          operation: "kb.gitattributes.ensure",
          bundlePath: root,
          outcome: "created",
        });
        return;
      }
      if (!hasMergeDeclaration(existing)) {
        await appendFile(target, appendUnionMergeLine(existing), "utf8");
        this.logger.info?.({
          operation: "kb.gitattributes.ensure",
          bundlePath: root,
          outcome: "appended",
        });
      }
    } catch (error) {
      this.logger.warn?.({
        operation: "kb.gitattributes.ensure",
        outcome: "failed",
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  /** Appends one log line. Failing to log must not fail the mutation. */
  private async record(
    root: string,
    entry: Omit<KbLogEntry, "at"> & { at?: string },
  ): Promise<void> {
    await this.ensureGitattributes(root);
    const line = renderLogEntry({ at: new Date().toISOString(), ...entry });
    await appendFile(join(root, LOG_FILE), line, "utf8").catch((error) => {
      this.logger.warn?.({
        operation: "kb.log.append",
        outcome: "failed",
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }

  private parse(conceptId: string, raw: string): KbRecord | null {
    const parsed = parseMarkdownWithFrontmatter(raw, kbRecordFrontmatterSchema);
    if (!parsed.frontmatter.success) {
      this.logger.warn?.({
        operation: "kb.parse",
        conceptId,
        outcome: "skipped",
        error: parsed.frontmatter.error.issues[0]?.message ?? "invalid",
      });
      return null;
    }
    return {
      conceptId,
      frontmatter: parsed.frontmatter.data,
      body: parsed.content,
    };
  }

  private root(bundlePath: string): string {
    return resolve(bundlePath);
  }

  // Concept ids are `<type>.<slug>` and map to a single file directly under the
  // bundle root; anything carrying a separator would escape it.
  private recordPath(bundlePath: string, conceptId: string): string {
    if (conceptId.includes(sep) || conceptId.includes("/")) {
      throw new KbInvalidConceptIdError(
        "concept id must not contain a path separator",
        { conceptId },
      );
    }
    return join(this.root(bundlePath), `${conceptId}.md`);
  }
}

/**
 * Deliberately crude, and labelled `approx` everywhere it surfaces. A real
 * tokeniser would be a dependency carried to decide whether to avoid carrying
 * dependencies, and four characters per token is close enough to choose
 * between "hand it over" and "do not".
 *
 * Exported (with `estimateStubTokens` and `stub`) so `pack` costs and stubs
 * records exactly as `load` does — two accountings would drift.
 */
export function estimateTokens(record: KbRecord): number {
  return Math.ceil(
    (record.body.length + JSON.stringify(record.frontmatter).length) / 4,
  );
}

export function estimateStubTokens(entry: KbSupersededStub): number {
  return Math.ceil(JSON.stringify(entry).length / 4);
}

/**
 * `heads` is where the supersession chain ends, which is what a reader needs:
 * pointing at an intermediate record that is itself superseded would answer
 * "what replaced this" with something else that no longer holds. A broken or
 * forked chain resolves to no head, and the warning that says so travels with
 * the head record rather than here.
 */
export function stub(hit: KbAdjudicated): KbSupersededStub {
  return {
    conceptId: hit.record.conceptId,
    title: hit.record.frontmatter.title ?? null,
    supersededBy: hit.heads.map((head) => head.conceptId),
    at: hit.record.frontmatter.generated?.at ?? null,
  };
}

function matches(record: KbRecord, needle: string): boolean {
  const { title, description } = record.frontmatter;
  // The concept id is searched too: a slug is chosen to describe the record, so
  // a base where `decision.cursor-v2` does not answer "cursor" is surprising in
  // a way no caller would think to work around.
  return [record.conceptId, title, description, record.body].some((field) =>
    field?.toLowerCase().includes(needle),
  );
}

/**
 * Case-normalizes only the kind prefix — the segment up to and including the
 * first `:` — so `Human:alice` and `human:alice` name the same kind of actor
 * while the identity after the colon keeps its case. An id with no colon is
 * all prefix, and is lowercased whole.
 */
function normalizeActor(id: string): string {
  const colon = id.indexOf(":");
  if (colon === -1) return id.toLowerCase();
  return id.slice(0, colon + 1).toLowerCase() + id.slice(colon + 1);
}

function digest(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}
