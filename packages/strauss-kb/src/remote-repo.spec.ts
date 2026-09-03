/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import {
  detectAnchorDrift,
  hashAnchorText,
  MAX_ANCHOR_FILE_BYTES,
  normalizeRepoUrl,
  resolveAnchor,
} from "./anchor-resolver/index.js";
import type { KbAnchor, KbRecord } from "./kb-record.schema.js";
import {
  cachePathFor,
  readRemoteAnchors,
  wantKey,
} from "./remote-repo/index.js";

/**
 * Every "remote" here is a bare repository on disk reached over `file://`.
 * The suite must pass with the machine unplugged: a test that reaches the
 * network is a test that fails in CI for reasons nobody can debug.
 */

const FILE = "src/orders.ts";

const V1 = [
  "export function totals(orders: Order[]): number {",
  "  return orders.length;",
  "}",
  "",
].join("\n");

const V2 = V1.replace("orders.length", "orders.length + 1");

type Ctx = { work: string };

const test = baseTest.extend<Ctx>({
  work: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "strauss-kb-remote-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
});

type Remote = { url: string; first: string; head: string };

/** A two-commit repository, published as a bare mirror on `file://`. */
function publish(work: string, versions: string[] = [V1, V2]): Remote {
  const source = join(work, "source");
  mkdirSync(join(source, "src"), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", source, ...args], { stdio: "pipe" })
      .toString()
      .trim();
  execFileSync("git", ["init", "-q", "-b", "main", source], { stdio: "pipe" });
  const shas: string[] = [];
  for (const [at, version] of versions.entries()) {
    writeFileSync(join(source, FILE), version, "utf8");
    git("add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", `v${at}`);
    shas.push(git("rev-parse", "HEAD"));
  }
  const bare = join(work, "remote.git");
  execFileSync("git", ["clone", "-q", "--bare", source, bare], {
    stdio: "pipe",
  });
  return {
    url: `file://${bare}`,
    first: shas[0] as string,
    head: shas[shas.length - 1] as string,
  };
}

function anchorFor(source: string, extra: Partial<KbAnchor> = {}): KbAnchor {
  const resolved = resolveAnchor(source, { file: FILE, symbol: "totals" });
  if (!resolved) throw new Error("fixture symbol did not resolve");
  return {
    file: FILE,
    symbol: "totals",
    hash: hashAnchorText(resolved.text),
    lines: resolved.endLine - resolved.startLine + 1,
    ...extra,
  };
}

function record(anchors: KbAnchor[]): KbRecord {
  return {
    conceptId: "decision.totals",
    frontmatter: {
      type: "decision",
      strauss_status: "accepted",
      strauss_anchors: anchors,
    },
    body: "The body.\n",
  };
}

/** Drift for one foreign anchor, against a root that is not a git repo at all. */
async function driftOf(
  anchor: KbAnchor,
  work: string,
  options: { offline?: boolean } = {},
) {
  const root = join(work, "root");
  mkdirSync(root, { recursive: true });
  const drift = await detectAnchorDrift([record([anchor])], {
    repoRoot: root,
    remote: { ...options, cacheDir: join(work, "cache") },
  });
  return drift.get("decision.totals")?.[0];
}

describe("cachePathFor", () => {
  test("is <host>/<org>/<name>.git, and nothing for a short form", () => {
    expect(cachePathFor("git@github.com:org/name.git", "/c")).toBe(
      "/c/github.com/org/name.git",
    );
    expect(cachePathFor("org/name", "/c")).toBeNull();
  });
});

describe("a foreign anchor", () => {
  test("matches when the ref and the default branch both agree", async ({
    work,
  }) => {
    const remote = publish(work);
    const entry = await driftOf(
      anchorFor(V2, { repo: remote.url, ref: remote.head }),
      work,
    );

    expect(entry).toMatchObject({
      state: "match",
      remoteState: "matches-ref",
      repo: remote.url,
    });
  });

  // The evidence itself is wrong: the record says the code hashed to this at
  // that commit, and the commit says otherwise.
  test("is drifted-from-ref when the pinned commit disagrees", async ({
    work,
  }) => {
    const remote = publish(work);
    const entry = await driftOf(
      anchorFor(V2, { repo: remote.url, ref: remote.first }),
      work,
    );

    expect(entry).toMatchObject({
      state: "drifted",
      remoteState: "drifted-from-ref",
    });
  });

  // The record is honest about its own commit; the code has moved past it.
  test("is drifted-on-default when only the branch moved", async ({ work }) => {
    const remote = publish(work);
    const entry = await driftOf(
      anchorFor(V1, { repo: remote.url, ref: remote.first }),
      work,
    );

    expect(entry).toMatchObject({
      state: "drifted",
      remoteState: "drifted-on-default",
      currentHash: hashAnchorText(V2.trimEnd()),
    });
  });

  test("compares against the default branch when it pins no ref", async ({
    work,
  }) => {
    const remote = publish(work);

    expect(
      await driftOf(anchorFor(V2, { repo: remote.url }), work),
    ).toMatchObject({ state: "match" });
    const drifted = await driftOf(anchorFor(V1, { repo: remote.url }), work);
    expect(drifted?.state).toBe("drifted");
    // No ref, so there is one state and no three-way to name.
    expect(drifted?.remoteState).toBeUndefined();
  });

  test("reports ref-not-found for a commit the remote does not have", async ({
    work,
  }) => {
    const remote = publish(work);
    const entry = await driftOf(
      anchorFor(V1, { repo: remote.url, ref: "0".repeat(40) }),
      work,
    );

    expect(entry).toMatchObject({
      state: "unresolved",
      reason: "ref-not-found",
    });
  });

  test("reports remote-unreachable rather than throwing", async ({ work }) => {
    const entry = await driftOf(
      anchorFor(V1, { repo: `file://${join(work, "gone.git")}` }),
      work,
    );

    expect(entry).toMatchObject({
      state: "unresolved",
      reason: "remote-unreachable",
    });
  });

  test("reports file-missing for a path the tree does not carry", async ({
    work,
  }) => {
    const remote = publish(work);
    const entry = await driftOf(
      { ...anchorFor(V1), file: "src/gone.ts", repo: remote.url },
      work,
    );

    expect(entry).toMatchObject({
      state: "unresolved",
      reason: "file-missing",
    });
  });

  // The same cap a working-tree read has: anchors point at source, and a
  // checked-in artefact is cost with no finding behind it.
  test("stops at the blob cap", async ({ work }) => {
    const remote = publish(work, ["x".repeat(MAX_ANCHOR_FILE_BYTES + 1)]);
    const entry = await driftOf(
      { file: FILE, hash: hashAnchorText(V1), repo: remote.url },
      work,
    );

    expect(entry).toMatchObject({
      state: "unresolved",
      reason: "file-too-large",
    });
  });
});

describe("the repo cache", () => {
  const cacheOf = (work: string, remote: Remote) =>
    cachePathFor(remote.url, join(work, "cache")) as string;

  test("serves a second run for a pinned commit without fetching", async ({
    work,
  }) => {
    const remote = publish(work);
    const want = { repo: remote.url, ref: remote.first, file: FILE };
    const options = { cacheDir: join(work, "cache") };
    expect((await readRemoteAnchors([want], options)).size).toBe(1);

    // FETCH_HEAD is written by every fetch and by nothing else, so its absence
    // after the second run is the proof that no fetch happened.
    rmSync(join(cacheOf(work, remote), "FETCH_HEAD"));
    const again = await readRemoteAnchors([want], options);

    const read = again.get(
      wantKey(normalizeRepoUrl(remote.url), remote.first, FILE),
    );
    expect(read?.ok && read.source).toBe(V1);
    expect(existsSync(join(cacheOf(work, remote), "FETCH_HEAD"))).toBe(false);
  });

  test("offline resolves what is cached and reports the rest unreachable", async ({
    work,
  }) => {
    const remote = publish(work);
    const anchor = anchorFor(V2, { repo: remote.url, ref: remote.head });
    expect((await driftOf(anchor, work))?.state).toBe("match");

    expect(await driftOf(anchor, work, { offline: true })).toMatchObject({
      state: "match",
      remoteState: "matches-ref",
    });
    const cold = anchorFor(V1, { repo: remote.url, ref: remote.first });
    expect(await driftOf(cold, work, { offline: true })).toMatchObject({
      state: "unresolved",
      reason: "remote-unreachable",
    });
  });

  test("fetches once per (repo, rev), not once per anchor", async ({
    work,
  }) => {
    const remote = publish(work);
    const wants = [1, 2, 3].map(() => ({
      repo: remote.url,
      ref: remote.first,
      file: FILE,
    }));

    const reads = await readRemoteAnchors(wants, {
      cacheDir: join(work, "cache"),
    });

    // Three wants collapse to one (repo, rev, file), so one entry comes back.
    expect(reads.size).toBe(1);
    const read = reads.get(
      wantKey(normalizeRepoUrl(remote.url), remote.first, FILE),
    );
    expect(read?.ok && read.source).toBe(V1);
  });
});

describe("this repository's own anchors", () => {
  // Nothing about remote resolution may reach an anchor that names no repo.
  test("are read from the working tree, with no cache in sight", async ({
    work,
  }) => {
    const root = join(work, "own");
    mkdirSync(dirname(join(root, FILE)), { recursive: true });
    writeFileSync(join(root, FILE), V1, "utf8");

    const drift = await detectAnchorDrift([record([anchorFor(V1)])], {
      repoRoot: root,
      // An unusable cache: a run that consulted it would fail, not match.
      remote: { cacheDir: "/nonexistent-strauss-cache", offline: true },
    });

    expect(drift.get("decision.totals")?.[0]).toMatchObject({ state: "match" });
    expect(drift.get("decision.totals")?.[0]?.repo).toBeUndefined();
  });
});
