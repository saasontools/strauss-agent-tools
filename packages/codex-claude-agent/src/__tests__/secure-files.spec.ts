import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  readFileNoFollow,
  writeFileAtomically,
} from "../utils/secure-files.js";

describe("secure file utilities", () => {
  it("atomically creates and replaces a private file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "secure-files-"));
    const target = path.join(directory, "state.json");

    await writeFileAtomically(target, "first");
    await writeFileAtomically(target, "second");

    expect(await readFile(target, "utf8")).toBe("second");
    if (process.platform !== "win32") {
      expect((await stat(target)).mode & 0o777).toBe(0o600);
    }
  });

  it("removes its temporary file when the atomic commit fails", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "secure-files-"));
    const target = path.join(directory, "state.json");
    await mkdir(target);

    await expect(writeFileAtomically(target, "content")).rejects.toThrow();
    const leftovers = (await readdir(directory)).filter((entry) =>
      entry.startsWith("state.json.tmp."),
    );
    expect(leftovers).toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "does not follow symlinks while reading",
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "secure-files-"));
      const source = path.join(directory, "source");
      const link = path.join(directory, "link");
      await writeFile(source, "sensitive");
      await symlink(source, link);

      await expect(readFileNoFollow(link)).rejects.toMatchObject({
        code: "ELOOP",
      });
    },
  );

  it.skipIf(process.platform === "win32")(
    "replaces a destination symlink without mutating its target",
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "secure-files-"));
      const source = path.join(directory, "source");
      const link = path.join(directory, "link");
      await writeFile(source, "sensitive");
      await symlink(source, link);

      await writeFileAtomically(link, "replacement");

      expect(await readFile(source, "utf8")).toBe("sensitive");
      expect(await readFile(link, "utf8")).toBe("replacement");
      expect((await lstat(link)).isSymbolicLink()).toBe(false);
    },
  );
});
