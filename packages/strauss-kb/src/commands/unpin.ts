import { z } from "zod";
import { unpinBase } from "../kb-pins/index.js";
import { bundlePath, define } from "./model.js";

export const unpinCommand = define({
  name: "unpin",
  tool: "kb_unpin",
  usage: "unpin [bundle-path]",
  description:
    "Remove a base from every pin manifest layer that holds it — project, local, and user — because unpinned means gone, not still injected from another file. Reports which layers were touched.",
  input: z.object({ bundlePath }),
  fromArgv: (argv, path) => ({ bundlePath: argv[1] ?? path }),
  run: (_ctx, { bundlePath: path }) => unpinBase(process.cwd(), path),
});
