---
name: psibase-local-browser
description: >-
  Opens and exercises the local psibase web UI using Cursor's Browser agent
  tools. Navigates to http://psibase.localhost:8080/ by default. Use when
  the user asks to use the browser, test the local UI, verify frontend changes,
  take snapshots or screenshots of psibase.localhost, or debug the dev server
  in a browser.
---

# Psibase local browser

## Default URL

Navigate to `http://psibase.localhost:8080/` for all local psibase UI work unless the user specifies a different path or origin.

Port **8080** is the default psinode dev-server port. Use `/check-psinode` to verify psinode is running before navigating.

## Workflow

1. Navigate to `http://psibase.localhost:8080/` (or the user's path).
2. Snapshot to confirm the page loaded and inspect structure.
3. Interact (click, type, scroll) using refs from the snapshot.
4. After any action that may change the page, take a fresh snapshot before the next interaction.
5. Use console output and network traffic tools to debug JS errors or failed API calls.
6. When done with all browser interactions, unlock the tab.

## Failure handling

- If the same action fails twice, gather new evidence (snapshot, console, network) before retrying.
- If the page won't load, run `/check-psinode` to verify psinode is up on port 8080.
- If login, passkey, or manual interaction blocks progress, stop and report to the user.

## Reference

- Browser tool docs: https://cursor.com/docs/agent/tools/browser.md
