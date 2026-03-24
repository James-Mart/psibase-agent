---
name: run-python-test
description: Runs psinode Python unittests from programs/psinode/tests using python3 and the correct --psinode build binary. Use when the user asks to run one Python test, multiple tests, or the whole Python test file from this directory.
---

# Run Python Unittests

## When to use this skill

- The user asks to run a Python test under `programs/psinode/tests/`
- The user asks to reproduce a failing Python CI test (often named `psinode_test_*`)
- The user provides a unittest selector like `SomeTestClass.test_method`

## What this skill runs

These scripts are regular `unittest` runners. You run the test file with:

`python3 <test_file.py> --psinode=<path-to-build/psinode> [unittest-selector...]`

If you omit the selector, the file runs all tests it defines.

## How to run

1. Repo root is `/root/psibase`.
2. Determine `psinode` binary:
   - Prefer `/root/psibase/build/psinode`
   - If it does not exist, abort: the environment is broken.
3. Pick which test file to run:
   - under `/root/psibase/programs/psinode/tests/`
   - the suite uses standard `unittest` classes/method names (e.g. `TestPsibase.test_staged_install`)
4. Run from the tests directory:
   - `cd /root/psibase/programs/psinode/tests`
5. Execute:
   ```bash
   python3 <test_file.py> --psinode=/root/psibase/build/psinode [unittest-selector]
   ```

## Examples

- Run a whole file (all tests in it):
  ```bash
  python3 test_psibase.py --psinode=/root/psibase/build/psinode
  ```
- Run one test method:
  ```bash
  python3 test_psibase.py --psinode=/root/psibase/build/psinode TestPsibase.test_staged_install
  ```

