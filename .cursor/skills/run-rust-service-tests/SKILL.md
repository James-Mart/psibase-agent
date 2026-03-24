---
name: run-rust-service-tests
description: Run rust unit tests for psibase package services (wasm services under packages/*/*/service/). Use when running or verifying tests for a Rust service. Does not apply to C++ services or to Rust plugins (wasm components).
---

# Rust service tests

## Scope

- **Applies to:** Rust **service** crates under `packages/*/*/service/` (the directory that contains that service’s `Cargo.toml`).
- **Does not apply to:** C++ services; Rust **plugin** crates (`packages/*/*/plugin/`).

## Run tests

From the **psibase repository root** (the tree that contains `build/rust/release/cargo-psibase`):

```bash
./build/rust/release/cargo-psibase test --manifest-path packages/<tier>/<Package>/service/Cargo.toml
```

Substitute the manifest path (e.g. `packages/system/VirtualServer/service/Cargo.toml`). This always uses the built binary, not whatever is on `PATH`. Use `cargo-psibase` as a subcommand of that binary—**not** `cargo psibase`.

**Optional:** Filter tests by name:

```bash
./build/rust/release/cargo-psibase test --manifest-path packages/<tier>/<Package>/service/Cargo.toml -- test_name_substring
```
