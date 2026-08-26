import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

export const verifyCommand = define({
  name: "verify",
  tool: "kb_verify",
  usage: "verify <concept-id> --note <text>",
  description:
    "Append one verified[] event — who checked the record, when, and what the check found. Appends only; prior events are never rewritten. A record's own generator is refused unless the actor is human: re-reading your own output is not an independent check.",
  input: z.object({ bundlePath, conceptId, note: z.string().min(1) }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    note: argvFlag(argv, "--note"),
  }),
  run: async (
    { store, actor, now },
    { bundlePath: path, conceptId: id, note },
  ) => {
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.verify(path, id, note, actor, now());
    return {
      conceptId: record.conceptId,
      verified: record.frontmatter.verified?.length ?? 0,
    };
  },
});
