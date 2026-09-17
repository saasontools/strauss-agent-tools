import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  appendIfAbsent,
  BUNDLE_IGNORE_BLOCK,
  GITIGNORE_FILE,
} from "../kb-files.js";
import { bundlePath, define } from "./model.js";

export type KbInitResult = {
  bundlePath: string;
  /** What the run did to the ignore file. */
  gitignore: "created" | "appended" | "present";
};

export const initCommand = define({
  name: "init",
  usage: "init [--bundle PATH]",
  description:
    "CLI-only: create the base directory and exclude its search index from Git. Run it once when the base does not exist yet; re-run it to put the block back after deleting it. Writing to a base creates the directory too, without the ignore rule.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: async (_ctx, { bundlePath: path }): Promise<KbInitResult> => {
    await mkdir(path, { recursive: true });
    const target = join(path, GITIGNORE_FILE);
    const existing = await readFile(target, "utf8").catch(() => null);
    const addition = appendIfAbsent(existing ?? "", BUNDLE_IGNORE_BLOCK);

    if (!addition) return { bundlePath: path, gitignore: "present" };
    await writeFile(target, `${existing ?? ""}${addition}`, "utf8");
    return {
      bundlePath: path,
      gitignore: existing === null ? "created" : "appended",
    };
  },
  render: (result) => {
    const { bundlePath: path, gitignore } = result as KbInitResult;
    return gitignore === "present"
      ? `${path} is ready; ${GITIGNORE_FILE} already excludes the search index.`
      : `${path} is ready; ${GITIGNORE_FILE} ${gitignore} to exclude the search index.`;
  },
});
