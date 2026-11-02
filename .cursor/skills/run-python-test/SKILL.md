---
name: run-python-test
description: Runs psinode Python unittests from programs/psinode/tests using python3 and the correct --psinode build binary. Use when the user asks to run one Python test, multiple tests, or the whole Python test file from this directory.
---

# Run Python Unittests

Run from `programs/psinode/tests` in the worktree you are editing:

```bash
python3 <test_file.py> --psinode="$(git rev-parse --show-toplevel)/build/psinode" [unittest-selector]
```

- Tests are standard `unittest` classes (e.g. `TestPsibase.test_staged_install`). Omit selector to run all.
- If `build/psinode` does not exist in this worktree, abort — the build is missing.
