import { randomBytes } from "node:crypto";
import { lstat, open, stat, unlink, type FileHandle } from "node:fs/promises";

import { RunnerError } from "../errors.js";
import { readFileNoFollow } from "../utils/secure-files.js";
import { getProcessIdentity, processExists } from "./processes.js";

const LOCK_STALE_MS = 30_000;
const LOCK_ATTEMPTS = 20;

interface LockRecord {
  token: string;
  pid: number;
  processIdentity?: string;
}

let currentProcessIdentity: string | undefined;

async function lockProcessIdentity(): Promise<string | undefined> {
  if (currentProcessIdentity) return currentProcessIdentity;
  const identity = await getProcessIdentity(process.pid);
  if (identity) currentProcessIdentity = identity;
  return identity;
}

async function lockOwnerIsAlive(owner: LockRecord | undefined) {
  if (!owner?.pid || !processExists(owner.pid)) return false;
  if (!owner.processIdentity) return true;
  const identity = await getProcessIdentity(owner.pid);
  return identity === undefined || identity === owner.processIdentity;
}

async function closeAndUnlinkOwnedFile(
  handle: FileHandle,
  filePath: string,
  token: string,
): Promise<void> {
  const opened = await handle.stat().catch(() => undefined);
  await handle.close().catch(() => undefined);
  const current = await lstat(filePath).catch(() => undefined);
  if (
    opened &&
    current &&
    opened.dev === current.dev &&
    opened.ino === current.ino
  ) {
    await unlink(filePath).catch(() => undefined);
    return;
  }
  const owner = await readFileNoFollow(filePath)
    .then((content) => JSON.parse(content) as LockRecord)
    .catch(() => undefined);
  if (owner?.token === token) await unlink(filePath).catch(() => undefined);
}

async function reapStaleLock(lockPath: string): Promise<void> {
  const observed = await stat(lockPath).catch(() => undefined);
  if (!observed) return;
  const observedOwner = await readFileNoFollow(lockPath)
    .then((content) => JSON.parse(content) as LockRecord)
    .catch(() => undefined);
  const ownerIsDead =
    observedOwner?.pid !== undefined &&
    !(await lockOwnerIsAlive(observedOwner));
  if (!ownerIsDead && Date.now() - observed.mtimeMs <= LOCK_STALE_MS) return;

  const reaperPath = `${lockPath}.reaper.${observed.dev}.${observed.ino}`;
  const reaperToken = randomBytes(16).toString("hex");
  let reaper: FileHandle | undefined;
  try {
    reaper = await open(reaperPath, "wx", 0o600);
    await reaper.writeFile(
      `${JSON.stringify({ token: reaperToken, pid: process.pid, processIdentity: await lockProcessIdentity() })}\n`,
    );
    await reaper.sync();
  } catch (error) {
    if (reaper) {
      await closeAndUnlinkOwnedFile(reaper, reaperPath, reaperToken);
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const [marker, owner] = await Promise.all([
      stat(reaperPath).catch(() => undefined),
      readFileNoFollow(reaperPath)
        .then((content) => JSON.parse(content) as LockRecord)
        .catch(() => undefined),
    ]);
    if (
      marker &&
      Date.now() - marker.mtimeMs > LOCK_STALE_MS &&
      !(await lockOwnerIsAlive(owner))
    ) {
      await unlink(reaperPath).catch(() => undefined);
    }
    return;
  }
  try {
    const current = await stat(lockPath).catch(() => undefined);
    if (
      !current ||
      current.dev !== observed.dev ||
      current.ino !== observed.ino ||
      current.mtimeMs !== observed.mtimeMs
    ) {
      return;
    }
    const owner = await readFileNoFollow(lockPath)
      .then((content) => JSON.parse(content) as LockRecord)
      .catch(() => undefined);
    if (await lockOwnerIsAlive(owner)) return;
    await unlink(lockPath).catch(() => undefined);
  } finally {
    await closeAndUnlinkOwnedFile(reaper, reaperPath, reaperToken);
  }
}

export async function acquireJobLock(
  lockPath: string,
  jobId: string,
): Promise<() => Promise<void>> {
  const token = randomBytes(16).toString("hex");
  let lock: FileHandle | undefined;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      lock = await open(lockPath, "wx", 0o600);
      await lock.writeFile(
        `${JSON.stringify({ token, pid: process.pid, processIdentity: await lockProcessIdentity() })}\n`,
      );
      await lock.sync();
      break;
    } catch (error) {
      if (lock) await closeAndUnlinkOwnedFile(lock, lockPath, token);
      lock = undefined;
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await reapStaleLock(lockPath);
      await new Promise((resolve) =>
        setTimeout(resolve, 25 + Math.random() * 50),
      );
    }
  }
  if (!lock) {
    throw new RunnerError("E_EXECUTION", `Could not lock job ${jobId}.`);
  }

  return async () => {
    if (lock) await closeAndUnlinkOwnedFile(lock, lockPath, token);
  };
}
