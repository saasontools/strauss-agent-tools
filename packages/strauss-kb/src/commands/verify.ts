import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

export const verifyCommand = define({
  name: "verify",
  tool: "kb_verify",
  usage: "verify <concept-id> --note <text>",
  description:
    "Append a verified[] event: who checked, when, and what was found. Append-only. A record's own generator is refused unless the actor is `human:`-prefixed.",
  input: z.object({
    bundlePath,
    conceptId,
    note: z.string().refine((s) => s.trim().length > 0, {
      message: "note must say what the check found",
    }),
  }),
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
