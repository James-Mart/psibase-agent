---
name: rebuild-package-on-change
description: Use package-builder to rebuild packages affected by edits under packages/.
---

When you modify files under `packages/**`, call the `package-builder` subagent.

Pass:
`ModifiedFiles: <modified file paths relative to repo root>`

Do not build directly in this skill.