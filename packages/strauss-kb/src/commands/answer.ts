import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { bundlePath, conceptId, define } from "./model.js";

export const answerCommand = define({
  name: "answer",
  tool: "kb_answer",
  usage: "answer <concept-id> <answer...>",
  description:
    "Resolve an open question: sets the status, stamps who answered and when, and appends an Answer section. If the answer overturns an assumption or a decision, that is a supersession — do it explicitly.",
  input: z.object({ bundlePath, conceptId, answer: z.string().min(1) }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    answer: argv.slice(2).join(" ").trim(),
  }),
  run: async (
    { store, actor },
    { bundlePath: path, conceptId: id, answer },
  ) => {
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.answer(path, id, answer, actor);
    return { conceptId: record.conceptId };
  },
});
