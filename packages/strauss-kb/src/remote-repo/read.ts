import { mkdir } from "node:fs/promises";
import type { AnchorUnresolvedReason } from "../anchor-resolver/model.js";
import { normalizeRepoUrl } from "../anchor-resolver/repo-identity.js";
import { DEFAULT_IO_CONCURRENCY, mapLimit } from "../concurrency.js";
import { cachePathFor, fetchTimeoutMs, repoCacheDir, revRef } from "./cache.js";
import { git, transportReason } from "./git.js";
import {
  wantKey,
  type RemoteOptions,
  type RemoteRead,
  type RemoteWant,
} from "./model.js";

/** Repositories fetched at once. Fetches within one repo stay serial. */
const DEFAULT_REPO_CONCURRENCY = 4;

/** A full commit sha can never mean different content, so it is fetched once. */
const IMMUTABLE_REV = /^[0-9a-f]{40}$/;

/**
 * Reads each wanted (repo, rev, file) out of a bare cache under
 * `~/.strauss/repo-cache`, fetching once per (repo, rev) and never per anchor.
 *
 * Every failure lands as an `unresolved` reason on the wants it affects; no
 * path is read from disk, so containment does not apply here.
 */
export async function readRemoteAnchors(
  wants: readonly RemoteWant[],
  options: RemoteOptions = {},
): Promise<Map<string, RemoteRead>> {
  const out = new Map<string, RemoteRead>();
  if (!wants.length) return out;

  const cacheDir = repoCacheDir(options.cacheDir);
  const timeoutMs = fetchTimeoutMs(options.fetchTimeoutMs);
  const byRepo = new Map<string, { url: string; wants: RemoteWant[] }>();
  for (const want of wants) {
    const key = normalizeRepoUrl(want.repo);
    const group = byRepo.get(key) ?? { url: want.repo.trim(), wants: [] };
    group.wants.push(want);
    byRepo.set(key, group);
  }

  const groups = [...byRepo.entries()];
  const results = await mapLimit(
    groups,
    Math.max(1, options.concurrency ?? DEFAULT_REPO_CONCURRENCY),
    ([repo, group]) =>
      readOneRepo(repo, group.url, group.wants, {
        cacheDir,
        timeoutMs,
        offline: options.offline === true,
      }),
  );
  for (const result of results) {
    for (const [key, read] of result) out.set(key, read);
  }
  return out;
}

type RepoContext = { cacheDir: string; timeoutMs: number; offline: boolean };

async function readOneRepo(
  repo: string,
  url: string,
  wants: readonly RemoteWant[],
  context: RepoContext,
): Promise<Map<string, RemoteRead>> {
  const all = (read: RemoteRead) =>
    new Map(wants.map((want) => [wantKey(repo, want.ref, want.file), read]));

  // A short `repo` (`org/name`) names a repository without saying where it
  // lives, so there is nothing to fetch from. `validate` warns on the spelling.
  const cache = cachePathFor(repo, context.cacheDir);
  if (!cache) return all({ ok: false, reason: "remote-unreachable" });

  const opened = await openCache(cache, url, context);
  if (opened) return all(opened);

  const wantsDefault = wants.some((want) => want.ref === undefined);
  const branch: Branch = wantsDefault
    ? await defaultBranch(cache, context)
    : {};

  // One fetch per rev, serial: two `git fetch` in one bare repo race for the
  // same lock.
  const revs = new Map<string, RemoteRead | undefined>();
  for (const rev of distinctRevs(wants, branch.name)) {
    revs.set(rev, await ensureRev(cache, rev, context));
  }

  const reads = await mapLimit(
    wants,
    DEFAULT_IO_CONCURRENCY,
    async (want): Promise<RemoteRead> => {
      const rev = want.ref ?? branch.name;
      if (rev === undefined) {
        return {
          ok: false,
          reason: branch.reason ?? "default-branch-unknown",
        };
      }
      const failed = revs.get(rev);
      if (failed) return failed;
      return readBlob(cache, rev, want.file, context);
    },
  );
  return new Map(
    wants.map((want, at) => [
      wantKey(repo, want.ref, want.file),
      reads[at] as RemoteRead,
    ]),
  );
}

function distinctRevs(
  wants: readonly RemoteWant[],
  branch: string | undefined,
): string[] {
  const revs = new Set<string>();
  for (const want of wants) {
    if (want.ref !== undefined) revs.add(want.ref);
    else if (branch) revs.add(branch);
  }
  return [...revs];
}

/** Creates the bare mirror if it is not there and points it at `url`. */
async function openCache(
  cache: string,
  url: string,
  context: RepoContext,
): Promise<RemoteRead | undefined> {
  try {
    await mkdir(cache, { recursive: true });
  } catch {
    return { ok: false, reason: "remote-unreachable" };
  }
  const init = await git(["init", "--bare", "--quiet", cache], {
    timeoutMs: context.timeoutMs,
  });
  if (!init.ok) return { ok: false, reason: "remote-unreachable" };
  // `config`, not `remote add`: the second run must not fail because the
  // first one already added it.
  const remote = await git(["config", "remote.origin.url", url], {
    cwd: cache,
    timeoutMs: context.timeoutMs,
  });
  return remote.ok ? undefined : { ok: false, reason: "remote-unreachable" };
}

type Branch = { name?: string; reason?: AnchorUnresolvedReason };

/**
 * The remote's default branch: asked once per repo per run, then remembered in
 * the cache so `--offline` and the next run have an answer.
 */
async function defaultBranch(
  cache: string,
  context: RepoContext,
): Promise<Branch> {
  if (!context.offline) {
    const listed = await git(["ls-remote", "--symref", "origin", "HEAD"], {
      cwd: cache,
      timeoutMs: context.timeoutMs,
    });
    const found = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(listed.stdout);
    if (listed.ok && found?.[1]) {
      const name = found[1];
      await git(["config", "strauss.defaultBranch", name], { cwd: cache });
      return { name };
    }
    if (!listed.ok) {
      const reason = transportReason(listed.stderr);
      if (reason !== "ref-not-found") {
        const cached = await cachedBranch(cache);
        return cached ? { name: cached } : { reason };
      }
    }
  }
  const cached = await cachedBranch(cache);
  if (cached) return { name: cached };
  // Offline with nothing cached is not a repository without a HEAD: the cause
  // is that nothing was reached, and that is what the finding should say.
  return {
    reason: context.offline ? "remote-unreachable" : "default-branch-unknown",
  };
}

async function cachedBranch(cache: string): Promise<string | undefined> {
  const stored = await git(["config", "--get", "strauss.defaultBranch"], {
    cwd: cache,
  });
  if (stored.ok && stored.stdout.trim()) return stored.stdout.trim();
  const head = await git(
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    {
      cwd: cache,
    },
  );
  const name = head.stdout.trim().replace(/^origin\//, "");
  return head.ok && name ? name : undefined;
}

/**
 * Fetches `rev` into a stable local ref, or reports why it could not.
 *
 * A full commit sha already in the cache is never refetched — its content
 * cannot change — while a branch is fetched every online run, because "current"
 * is exactly what a branch means.
 */
async function ensureRev(
  cache: string,
  rev: string,
  context: RepoContext,
): Promise<RemoteRead | undefined> {
  const ref = revRef(rev);
  const have = await git(
    ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
    {
      cwd: cache,
    },
  );
  const cached = have.ok && have.stdout.trim().length > 0;
  if (cached && (context.offline || IMMUTABLE_REV.test(rev))) return undefined;
  if (context.offline) return { ok: false, reason: "remote-unreachable" };

  const fetched = await git(["fetch", "--depth", "1", "origin", rev], {
    cwd: cache,
    timeoutMs: context.timeoutMs,
  });
  if (!fetched.ok) {
    // A stale cached copy beats no answer when the network is the problem;
    // a rev the remote no longer has is a finding either way.
    const reason = transportReason(fetched.stderr);
    if (cached && reason !== "ref-not-found") return undefined;
    return { ok: false, reason };
  }
  const head = await git(["rev-parse", "FETCH_HEAD"], { cwd: cache });
  const sha = head.stdout.trim();
  if (!head.ok || !sha) return { ok: false, reason: "remote-unreachable" };
  const updated = await git(["update-ref", ref, sha], { cwd: cache });
  return updated.ok ? undefined : { ok: false, reason: "remote-unreachable" };
}

/** `git cat-file blob <rev>:<file>`, capped at the same 1 MiB as a local read. */
async function readBlob(
  cache: string,
  rev: string,
  file: string,
  context: RepoContext,
): Promise<RemoteRead> {
  const path = file.replace(/^\.\//, "");
  const blob = await git(["cat-file", "blob", `${revRef(rev)}:${path}`], {
    cwd: cache,
    timeoutMs: context.timeoutMs,
  });
  if (blob.ok) return { ok: true, source: blob.stdout };
  if (blob.overflowed) return { ok: false, reason: "file-too-large" };
  const text = blob.stderr.toLowerCase();
  return text.includes("does not exist") || text.includes("not a valid object")
    ? { ok: false, reason: "file-missing" }
    : { ok: false, reason: "file-unreadable" };
}
