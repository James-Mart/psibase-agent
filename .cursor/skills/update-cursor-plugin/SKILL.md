---
name: update-cursor-plugin
description: Update a Cursor plugin by editing the authoritative copy under /root/agent-config/.cursor/plugins/<plugin-name>/ and then copying (not symlinking) the entire plugin directory to /root/.cursor/plugins/local/<plugin-name>/. Use when the user asks to update, edit, modify, or sync a cursor plugin by name.
---

# Update Cursor Plugin

This skill takes a single argument: `<plugin-name>` (the directory name of the plugin).

## Locations

- **Authoritative source** (edit here): `/root/agent-config/.cursor/plugins/<plugin-name>/`
- **Active install** (copy target): `/root/.cursor/plugins/local/<plugin-name>/`

Only the authoritative copy under `/root/agent-config/` should be edited. The copy in `/root/.cursor/plugins/local/` is a deployment target — never edit it directly, and never replace it with a symlink.

## Workflow

1. **Verify the plugin exists** at the authoritative location:
   ```bash
   ls /root/agent-config/.cursor/plugins/<plugin-name>/
   ```
   If it does not exist, stop and tell the user.

2. **Make the requested edits** inside `/root/agent-config/.cursor/plugins/<plugin-name>/` using the normal file editing tools. Do not touch `/root/.cursor/plugins/local/<plugin-name>/` at this stage.

3. **Deploy by copying the entire plugin directory** from the authoritative source to the active install location. Replace the existing active install so removed files do not linger:
   ```bash
   rm -rf /root/.cursor/plugins/local/<plugin-name>
   cp -r /root/agent-config/.cursor/plugins/<plugin-name> /root/.cursor/plugins/local/<plugin-name>
   ```
   Do not use `ln -s` or any symlink. The destination must be a real copy.

4. **Confirm the copy succeeded** by listing the destination and spot-checking that the edited files are present:
   ```bash
   ls /root/.cursor/plugins/local/<plugin-name>/
   ```

## Rules

- Never edit `/root/.cursor/plugins/local/<plugin-name>/` directly.
- Never replace `/root/.cursor/plugins/local/<plugin-name>/` with a symlink to the authoritative source.
- Always copy the **entire** plugin directory, not just the changed files, so the active install matches the authoritative source exactly.
