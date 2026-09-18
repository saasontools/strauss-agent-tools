import {
  anchorFileReader,
  atRefKey,
  LazyOrigin,
  normalizeRepoUrl,
  readAnchorFiles,
  readCommitted,
  remoteWants,
  type AnchorRead,
} from "../../anchor-resolver/index.js";
import type { KbAnchor } from "../../kb-record.schema.js";
import { readRemoteAnchors, wantKey } from "../../remote-repo/index.js";
import type { AnchorSource } from "./model.js";

/**
 * What each anchor is read from: the working tree for this repository's own,
 * the committed tree at `ref` for an old-side one, a bare remote cache for
 * every other. Each set is collected first, so git is spawned once per
 * (repo, rev) and never inside the loop.
 */
export async function readSources(
  anchors: readonly KbAnchor[],
  root: string,
  offline: boolean,
): Promise<Map<KbAnchor, AnchorSource>> {
  const origin = new LazyOrigin(root);
  if (anchors.some((anchor) => anchor.repo)) await origin.prime();
  const foreign = new Map(
    anchors.map((anchor) => [anchor, origin.isForeign(anchor)] as const),
  );

  const local = anchors.filter(
    (anchor) => !foreign.get(anchor) && anchor.side !== "old",
  );
  // The committed side never comes from the working tree: `side: "old"` is
  // about code that may not be there any more.
  const committed = anchors.filter(
    (anchor) => !foreign.get(anchor) && anchor.side === "old",
  );
  const remote = anchors.filter((anchor) => foreign.get(anchor));
  const reads = await readAnchorFiles(
    local.map((anchor) => anchor.file),
    anchorFileReader(root),
  );
  const atRef = await readCommitted(root, committed);
  const blobs = await readRemoteAnchors(remote.flatMap(remoteWants), {
    offline,
  });

  const sources = new Map<KbAnchor, AnchorSource>();
  for (const anchor of local) {
    const read = reads.get(anchor.file) as AnchorRead;
    sources.set(
      anchor,
      read.ok
        ? { ok: true, source: read.source }
        : { ok: false, reason: read.reason },
    );
  }
  for (const anchor of committed) {
    const read = atRef.get(atRefKey(anchor)) as AnchorRead;
    sources.set(
      anchor,
      read.ok
        ? { ok: true, source: read.source }
        : { ok: false, reason: read.reason },
    );
  }
  for (const anchor of remote) {
    const repo = anchor.repo as string;
    const key = normalizeRepoUrl(repo);
    const atDefault = blobs.get(wantKey(key, undefined, anchor.file));
    const primary = anchor.ref
      ? blobs.get(wantKey(key, anchor.ref, anchor.file))
      : atDefault;
    if (!primary?.ok) {
      sources.set(anchor, {
        ok: false,
        reason: primary?.ok === false ? primary.reason : "remote-unreachable",
        repo,
      });
      continue;
    }
    sources.set(anchor, {
      ok: true,
      source: primary.source,
      repo,
      ...(anchor.ref && atDefault?.ok ? { head: atDefault.source } : {}),
    });
  }
  return sources;
}
