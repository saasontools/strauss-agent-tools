import { z } from "zod";
import { bundlePath, define } from "./model.js";

export const logCommand = define({
  name: "log",
  tool: "kb_log",
  usage: "log",
  description:
    "What touched what, and when. The only artifact here that cannot be reconstructed from the records, so malformed lines are reported rather than repaired.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: ({ store }, { bundlePath: path }) => store.readLog(path),
});
