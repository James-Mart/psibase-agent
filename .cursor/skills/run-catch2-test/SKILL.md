---
name: run-catch2-test
description: Runs Catch2 unit tests packaged as WASM using the build tree psitest driver. Use when the user asks to run wasm unit tests, psitest, Catch2 tests, psibase-tests, or to verify a specific test case or section after C++ changes under libraries/ or packages/.
---

# Run WASM Catch2 tests

Working directory: `/root/psibase/build`

```bash
./psitest <test>.wasm [Catch2 args...]
```

- Aggregated test binary: `psibase-tests.wasm`. Per-package binaries: `ls *.wasm`.
- Prefer release wasm unless the user needs `-debug`.
- If `psitest` or the wasm is missing, build first — do not invent alternate runners.

## Not this skill

- **Python** tests (`programs/psinode/tests/`) -> **run-python-test** skill.
- **Rust** `cargo test` (`packages/*/*/service/`) -> **run-rust-service-tests** skill.
