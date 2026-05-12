# self-code-review

Cursor plugin that slices a large working tree into a sequence of small, semantically-coherent, compileable commits. The user reviews each candidate as **unstaged** changes in the working tree, runs their own build between commits, and approves before each commit lands. Nothing is ever pushed.

## Install

Drop the plugin directory under `~/.cursor/plugins/local/` (Cursor's local-plugin location). Reload the Cursor window.

## Usage

In Agent chat, invoke:

```
/self-code-review
```

The skill is gated to manual invocation only (`disable-model-invocation: true`); the agent will not auto-suggest it from context.

## Layout

- `.cursor-plugin/plugin.json` — plugin manifest.
- `agents/` — four specialist subagents (`self-review-surveyor`, `self-review-hunk-picker`, `self-review-build-diagnoser`, `self-review-message-writer`) the skill delegates to. All run readonly; only the parent agent applies patches and commits.
- `skills/self-code-review/SKILL.md` — full workflow specification (the entry point).
- `skills/self-code-review/scripts/` — bash scripts the skill invokes for snapshot lifecycle, patch application, and spin-off branches.

See [`skills/self-code-review/SKILL.md`](skills/self-code-review/SKILL.md) for the workflow itself.
