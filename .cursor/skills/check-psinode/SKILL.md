---
name: check-psinode
description: >-
  Checks whether psinode is running and reports its pid and listen port.
  Use when the user asks if psinode is running, before starting a new
  psinode, or when diagnosing connection issues to psibase.localhost.
---

# Check psinode

Run the script:

```bash
bash .cursor/skills/check-psinode/scripts/check-psinode.sh
```

- Exit 0 + message → psinode is running.
- Exit 1 + message → psinode is not running.
