import { z } from "zod";
import { pinBase } from "../kb-pins/index.js";
import { argvFlag, bundlePath, define } from "./model.js";

export const pinCommand = define({
  name: "pin",
  tool: "kb_pin",
  usage:
    "pin [bundle-path] [--mode full|index] [--profiles a,b] [--local|--user] [--frozen|--unfreeze]",
  description:
    "Pin a base into a workspace manifest so kb_context surfaces it. Layers, nearest wins: project `.strauss/kb-pins.json` (default), `--local` (personal, gitignored), `--user` (`~/.strauss`). Idempotent; `--mode full|index`, `--profiles`, `--frozen`/`--unfreeze` update only those fields. A path with no records pins with a warning. Never touches the base itself.",
  input: z.object({
    bundlePath,
    mode: z
      .enum(["full", "index"])
      .optional()
      .describe(
        "full: always emit this base's records whole (still under the block budget); index: never upgrade. Absent: the profile's full-under threshold decides.",
      ),
    profiles: z
      .array(z.string())
      .optional()
      .describe("Context profiles this pin surfaces in. Absent: all of them."),
    layer: z
      .enum(["project", "local", "user"])
      .optional()
      .describe(
        "Which manifest to write: project (committed, default), local (personal, gitignored), user (~/.strauss, every workspace).",
      ),
    frozen: z
      .boolean()
      .optional()
      .describe(
        "true: the base is concluded — writes against it refuse while pinned. false: lift a freeze.",
      ),
  }),
  fromArgv: (argv, path) => {
    const positional = argv[1] && !argv[1].startsWith("--") ? argv[1] : path;
    const mode = argvFlag(argv, "--mode");
    const profiles = argvFlag(argv, "--profiles");
    const layer = argv.includes("--user")
      ? "user"
      : argv.includes("--local")
        ? "local"
        : undefined;
    const frozen = argv.includes("--frozen")
      ? true
      : argv.includes("--unfreeze")
        ? false
        : undefined;
    return {
      bundlePath: positional,
      ...(mode ? { mode } : {}),
      ...(profiles
        ? {
            profiles: profiles
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
          }
        : {}),
      ...(layer ? { layer } : {}),
      ...(frozen !== undefined ? { frozen } : {}),
    };
  },
  run: ({ store, now }, { bundlePath: path, mode, profiles, layer, frozen }) =>
    pinBase(store, process.cwd(), path, now(), {
      ...(mode ? { mode } : {}),
      ...(profiles ? { profiles } : {}),
      ...(layer ? { layer } : {}),
      ...(frozen !== undefined ? { frozen } : {}),
    }),
});
