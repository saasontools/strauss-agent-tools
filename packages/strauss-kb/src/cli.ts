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

export async function runKbCli(argv: string[]): Promise<void> {
  const { bundle, rest } = takeBundle(argv);
  const name = rest[0] ?? "";

  if (!name || name === "-h" || name === "--help") {
    process.stdout.write(usage());
    return;
  }

  const command = KB_COMMANDS_BY_NAME.get(name);
  if (!command) die(`unknown command ${name}`);

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
  if (command.failsWhen?.(result)) process.exitCode = 1;
  // An empty string is deliberate silence — `context` with nothing pinned
  // runs from hooks at every session start, and even a bare newline is noise
  // injected into a fresh context.
  if (result === "") return;
  process.stdout.write(
    typeof result === "string"
      ? result.endsWith("\n")
        ? result
        : `${result}\n`
      : `${JSON.stringify(result, null, 2)}\n`,
  );
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
    "  STRAUSS_KB_ACTOR names the writer in the log",
    "",
  ].join("\n");
}
