import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { actorClassOf, emitKb } from "../telemetry/index.js";
import {
  ACTOR,
  actorOf,
  argvActor,
  argvFlag,
  argvPositional,
  bundlePath,
  conceptId,
  define,
  FREE_TEXT,
} from "./model.js";

export const verifyCommand = define({
  name: "verify",
  tool: "kb_verify",
  usage: "verify <concept-id> --note <text> [--actor K:N]",
  description:
    "Append a verified[] event: who checked, when, and what was found. Append-only. A record's own generator is refused unless the actor is `human:`-prefixed.",
  input: z.object({
    bundlePath,
    conceptId,
    note: FREE_TEXT,
    actor: ACTOR,
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argvPositional(argv, "--note", "--actor"),
    note: argvFlag(argv, "--note"),
    ...argvActor(argv),
  }),
  run: async (ctx, parsed) => {
    const { bundlePath: path, conceptId: id, note } = parsed;
    const { store, now } = ctx;
    const actor = actorOf(ctx, parsed);
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
