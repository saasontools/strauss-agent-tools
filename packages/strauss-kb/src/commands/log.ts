import { z } from "zod";
import { bundlePath, define } from "./model.js";

export const logCommand = define({
  name: "log",
  tool: "kb_log",
  usage: "log",
  description:
    "Who touched what, and when. Append-only; malformed lines are reported, never repaired.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: ({ store }, { bundlePath: path }) => store.readLog(path),
});
