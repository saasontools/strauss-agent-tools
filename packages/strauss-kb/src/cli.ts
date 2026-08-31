/**
 * strauss-kb — a knowledge base's command line.
 *
 * A dispatcher over `KB_COMMANDS`, which the MCP server also projects. Nothing
 * command-specific lives here beyond turning argv into the object both
 * surfaces pass.
 */
import { join } from "node:path";
import { KB_COMMANDS, KB_COMMANDS_BY_NAME } from "./commands/index.js";
import { KB_DIR, KbStore } from "./kb-store.js";
import { VERSION } from "./version.js";

export async function runKbCli(argv: string[]): Promise<void> {
  const { flags, literal } = takeLiteral(argv);
  const { bundle, rest: withFlags } = takeBundle(flags);
  const name = withFlags[0] ?? "";

  if (!name || name === "-h" || name === "--help") {
    process.stdout.write(usage());
    return;
  }

  // The plugin in front of this CLI updates from a marketplace while the CLI
  // updates from npm, and neither prompts for the other. Answering "which one
  // is installed" is what makes that skew diagnosable instead of mysterious.
  if (name === "--version" || name === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const command = KB_COMMANDS_BY_NAME.get(name);
  if (!command) die(`unknown command ${name}`);

  // Output shape, not an argument: stripped before the command sees argv, so a
  // positional adapter never has to know the flag exists. Refused rather than
  // ignored where a command has only one form — a flag that silently does
  // nothing teaches a caller that it worked.
  const json = withFlags.includes("--json");
  if (json && !command.render) {
    die(`${name} takes no --json: its result is already the machine shape`);
  }
  const rest = [
    ...(json
      ? withFlags.filter((argument) => argument !== "--json")
      : withFlags),
    ...literal,
  ];

  const raw = await command.fromArgv(rest, bundle, readStdin);
  const parsed = command.input.safeParse(raw);
  if (!parsed.success) {
    die(
      `${name}: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const store = new KbStore({
    warn: (entry) => process.stderr.write(`${JSON.stringify(entry)}\n`),
  });
  const result = await command.run(
    {
      store,
      actor: process.env.STRAUSS_KB_ACTOR ?? "unknown",
      now: () => new Date().toISOString(),
    },
    parsed.data,
  );

  // A check reporting a problem succeeded as a command and failed as a check;
  // the command says which, rather than the dispatcher knowing their names.
  if (command.failsWhen?.(result, parsed.data)) process.exitCode = 1;
  // An empty string is deliberate silence — `context` with nothing pinned
  // runs from hooks at every session start, and even a bare newline is noise
  // injected into a fresh context.
  if (result === "") return;
  const text =
    command.render && !json
      ? command.render(result)
      : typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

/**
 * Everything after a bare `--` is text, never flags.
 *
 * Several verbs end in free prose — `no-decision`, `answer`, `query` — and a
 * reason that happens to contain `--json` or `--bundle` would otherwise lose a
 * word to the flag scan, or two. The sentinel is the usual escape, and the
 * token itself is dropped while the order of everything else is kept, so the
 * positional adapters still index the same way.
 */
function takeLiteral(argv: string[]): { flags: string[]; literal: string[] } {
  const at = argv.indexOf("--");
  if (at === -1) return { flags: argv, literal: [] };
  return { flags: argv.slice(0, at), literal: argv.slice(at + 1) };
}

/**
 * `--bundle` addresses a base directly; without it the command works on the
 * one under the current directory. A base belongs to whatever prompted it, so
 * the default cannot be the only option.
 */
function takeBundle(argv: string[]): { bundle: string; rest: string[] } {
  const at = argv.indexOf("--bundle");
  if (at === -1) {
    return { bundle: join(process.cwd(), KB_DIR), rest: argv };
  }
  const bundle = argv[at + 1];
  if (!bundle) die("--bundle requires a path");
  return { bundle, rest: [...argv.slice(0, at), ...argv.slice(at + 2)] };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", reject);
  });
}

function die(message: string): never {
  process.stderr.write(`strauss-kb: error: ${message}\n`);
  process.exit(1);
}

/** First sentence, capped — the full text is what an MCP client shows. */
function summarise(description: string): string {
  const first = description.split("\n")[0] ?? "";
  const sentence = first.includes(". ")
    ? `${first.slice(0, first.indexOf(". "))}.`
    : first;
  return sentence.length > 78 ? `${sentence.slice(0, 75)}…` : sentence;
}

function usage(): string {
  const width = Math.max(...KB_COMMANDS.map((command) => command.usage.length));
  return [
    "strauss-kb — knowledge base commands",
    "",
    "Usage: strauss-kb [--bundle PATH] <command> [args]",
    "",
    ...KB_COMMANDS.map(
      (command) =>
        `  ${command.usage.padEnd(width)}  ${summarise(command.description)}`,
    ),
    "",
    `  --bundle PATH  defaults to ./${KB_DIR}`,
    "  --json         the machine shape, where a command prints a table",
    "  --             everything after it is text, not flags",
    "  --version      the installed package version",
    "  STRAUSS_KB_ACTOR names the writer in the log",
    "",
  ].join("\n");
}
