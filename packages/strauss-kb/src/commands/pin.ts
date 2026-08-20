import { z } from "zod";
import { pinBase } from "../kb-pins/index.js";
import { argvFlag, bundlePath, define } from "./model.js";

export const pinCommand = define({
  name: "pin",
  tool: "kb_pin",
  usage:
    "pin [bundle-path] [--mode full|index] [--profiles a,b] [--local|--user] [--frozen|--unfreeze]",
  description:
    "Pin a base into a workspace pin manifest, so `context` surfaces it at every context birth. Three layers, nearest wins: the committed project manifest (.strauss/kb-pins.json, the default), `--local` (.strauss/kb-pins.local.json, personal and gitignored), and `--user` (~/.strauss/kb-pins.json, every workspace). Idempotent — re-pinning changes nothing unless --mode, --profiles, or --frozen/--unfreeze are given, which update just those fields. `--mode full` preloads the whole base into the block regardless of the full-under threshold; `--mode index` never upgrades. `--profiles` scopes the pin to named context profiles. `--frozen` marks the base concluded: write commands against it refuse and `context` labels it read-only. A path with no records yet succeeds with a warning; bases are routinely pinned before they are populated. Pins are workspace state: the pinned base itself is never touched.",
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
