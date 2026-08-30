# Gemini Infographics plugin

Generate infographic images with Gemini's image models ("nano banana") from a
JSON spec — flat-vector diagrams, before/after contrasts, journey strips,
annotated simulated screenshots — with the model configurable and an automatic
fallback to the newest live model when a pinned id ages out.

Skill-only: no MCP server, no npm install. The generator is a single
dependency-free Node script.

One directory, three plugin formats — nothing collides:

| Client                                                                 | Manifest                     | Skills    |
| ---------------------------------------------------------------------- | ---------------------------- | --------- |
| Agent Plugins 1.0 (ChatGPT, Codex CLI, Cursor, Copilot, VS Code, Kiro) | `plugin.json`                | `skills/` |
| Claude Code                                                            | `.claude-plugin/plugin.json` | `skills/` |
| Codex                                                                  | `.codex-plugin/plugin.json`  | `skills/` |

## Install

### Claude Code

```
/plugin marketplace add https://github.com/saasontools/strauss-agent-tools
/plugin install gemini-infographics@saasontools
```

### Codex

Add the marketplace from this repository (`.agents/plugins/marketplace.json`),
then install `gemini-infographics`.

## Requirements

- Node 18+ (standard library only — no dependencies, no build step)
- A Gemini API key (get one at <https://aistudio.google.com/apikey>), supplied
  through any of, first match wins:
  - `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) — the key itself
  - `GEMINI_API_KEY_COMMAND` — a command whose stdout is the key, for keeping
    it in an OS vault rather than a shell profile:
    `op read 'op://Private/Gemini/credential'`,
    `security find-generic-password -s gemini-api-key -w`,
    `secret-tool lookup service gemini`, `pass show gemini/api-key`. It runs
    once per run, so a Touch ID prompt happens at most once.
  - `GEMINI_API_KEY_FILE` — a file containing the key

Diagnostics are redacted before printing: Google-shaped keys, anything assigned
to a key/token/secret-ish name, and the configured key value itself, however it
was sourced.

## Configuring it once

Environment variables have to reach every session that runs the script —
background agents, scheduled runs, and fresh terminals included. To avoid that,
put the settings in a per-user config file instead:

`~/.config/gemini-infographics.json` — `chmod 600` it if it holds a literal
key:

```json
{
  "apiKeyCommand": "op read 'op://Private/Gemini/credential'",
  "model": "flash",
  "mode": "auto",
  "fallback": true
}
```

Accepted keys: `apiKey`, `apiKeyCommand`, `apiKeyFile`, `model`, `mode`,
`fallback`. `$XDG_CONFIG_HOME` relocates the file; `$GEMINI_INFOGRAPHICS_CONFIG`
points at an exact path. Settings resolve in the order **flag, environment,
config file, built-in default**, and `--dry-run` prints which file was read.

The file is read from the user's config directory only, never from the project
being worked on: `apiKeyCommand` executes a command, and honouring a checked-in
config would make cloning a repository enough to run its author's shell.

Clients can inject the environment variables once per machine instead, if you
would rather configure it there — an `env` block in `~/.claude/settings.json`
for Claude Code, and for Codex a `set` table in `~/.codex/config.toml`, which
reaches every subprocess Codex spawns:

```toml
[shell_environment_policy]
set = { GEMINI_API_KEY_COMMAND = "op read 'op://Private/Gemini/credential'" }
```

`ignore_default_excludes` on that table defaults to `true`, which keeps
variables whose names contain `KEY`, `SECRET` or `TOKEN`. Where it has been set
to `false`, an inherited `GEMINI_API_KEY` is stripped before the script sees it;
`set` it explicitly, or use the config file. The config file is the only option
that also covers a cron job or a plain terminal.

Images cost money: roughly 2–13¢ each depending on model and batching.

## Usage

The skill drives the script; you can also run it directly:

```bash
node skills/gemini-infographics/scripts/generate-infographics.mjs \
  spec.json --out ./viz
```

```json
[
  {
    "name": "viz-four-gates",
    "prompt": "Flat vector diagram on a warm off-white background. EXACTLY FOUR gates …",
    "aspectRatio": "16:9",
    "imageSize": "1K",
    "model": "flash"
  }
]
```

Entries sharing a resolved model are batched (half price) when there are three
or more; otherwise they run sync. Output lands in `<out>/<name>.png`.

### Model configuration

Precedence: the entry's `"model"` → `--model` → `$GEMINI_IMAGE_MODEL` →
`flash`.

| Value                                                          | Meaning                                                |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| `flash` / `flash-lite` / `pro`                                 | pinned known-good ids                                  |
| `latest` / `latest-flash` / `latest-flash-lite` / `latest-pro` | newest live model in that family, resolved at run time |
| any concrete id, e.g. `gemini-3.1-flash-image`                 | used verbatim                                          |

When a pinned id returns 404/NOT_FOUND or the key has no access to it, the
script falls back to the newest live model in the same family and says so on
stderr. Disable with `--no-fallback` or `GEMINI_IMAGE_MODEL_FALLBACK=off`.

Other flags: `--dry-run` (validate the spec and print the model plan, no
network), `--list-models` (image models this key can reach, newest first),
`--mode auto|sync|batch`.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).
