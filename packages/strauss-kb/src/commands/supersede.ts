import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { bundlePath, conceptId, define } from "./model.js";

export const supersedeCommand = define({
  name: "supersede",
  tool: "kb_supersede",
  usage: "supersede <concept-id> <replacement-id>",
  description:
    "Mark a record superseded by another, linking both directions. Use this rather than editing a record whose meaning changed — a record that quietly becomes something else invalidates every reference to it, and the earlier understanding is what a later trace needs.",
  input: z.object({ bundlePath, conceptId, replacementId: conceptId }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    replacementId: argv[2],
  }),
  run: async (
    { store, actor },
    { bundlePath: path, conceptId: id, replacementId },
  ) => {
    await assertBaseNotFrozen(process.cwd(), path);
    await store.supersede(path, id, replacementId, actor);
    return { superseded: id, replacedBy: replacementId };
  },
});
