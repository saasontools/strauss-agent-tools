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
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in the environment; get one at
  <https://aistudio.google.com/apikey>

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
