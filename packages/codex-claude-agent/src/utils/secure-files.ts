import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink, type FileHandle } from "node:fs/promises";

function symlinkError(filePath: string): NodeJS.ErrnoException {
  return Object.assign(
    new Error(`Refusing to follow a symbolic link: ${filePath}`),
    { code: "ELOOP" },
  );
}

export async function openFileNoFollow(
  filePath: string,
  flags: number,
  mode?: number,
): Promise<FileHandle> {
  const noFollow = constants.O_NOFOLLOW;
  const handle = await open(filePath, flags | (noFollow ?? 0), mode);
  if (noFollow !== undefined) return handle;

  try {
    const [pathDetails, handleDetails] = await Promise.all([
      lstat(filePath),
      handle.stat(),
    ]);
    if (
      pathDetails.isSymbolicLink() ||
      pathDetails.dev !== handleDetails.dev ||
      pathDetails.ino !== handleDetails.ino
    ) {
      throw symlinkError(filePath);
    }
    return handle;
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

export async function readFileNoFollow(filePath: string): Promise<string> {
  const handle = await openFileNoFollow(filePath, constants.O_RDONLY);
  try {
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export async function writeFileAtomically(
  filePath: string,
  content: string | Uint8Array,
): Promise<void> {
  const temporary = `${filePath}.tmp.${process.pid}.${randomBytes(4).toString("hex")}`;
  let handle: FileHandle | undefined;
  let committed = false;
  try {
    handle = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
    committed = true;
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (!committed) await unlink(temporary).catch(() => undefined);
  }
}
