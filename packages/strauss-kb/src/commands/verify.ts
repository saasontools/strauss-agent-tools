import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { actorClassOf, emitKb } from "../telemetry/index.js";
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
    await emitKb("verify", {
      bundle: path,
      actorClass: actorClassOf(actor),
      data: {
        conceptId: record.conceptId,
        verified: record.frontmatter.verified?.length ?? 0,
      },
    });
    return {
      conceptId: record.conceptId,
      verified: record.frontmatter.verified?.length ?? 0,
    };
  },
});
