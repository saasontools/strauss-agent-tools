import { z } from "zod";
import { bundlePath, conceptId, define } from "./model.js";

export const backlinksCommand = define({
  name: "backlinks",
  tool: "kb_backlinks",
  usage: "backlinks <concept-id>",
  description:
    'Who points at this record: every inbound typed causal link (`strauss_links`), one hop, every rel including `related_to`, each with its rel and the standing of the record that made it. Use it when you need the exact edges — reviewing or renaming a record; kb_impact instead answers "what breaks if this changes" and follows each rel\'s direction of dependence to do it.',
  input: z.object({ bundlePath, conceptId }),
  fromArgv: (argv, path) => ({ bundlePath: path, conceptId: argv[1] }),
  run: async ({ store }, { bundlePath: path, conceptId: id }) =>
    store.backlinks(path, id),
});
