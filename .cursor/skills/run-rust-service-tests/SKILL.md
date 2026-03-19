---
name: run-rust-service-tests
description: Run rust unit tests for psibase package services. Use when running or verifying tests for a Rust service. Does not apply to C++ services or to Rust plugins (wasm components).
---

# Rust Service Tests

## Scope

- **Applies to:** Rust **service** crates (core wasm). Example: `packages/*/*/service/`.
- **Does not apply to:** C++ services; Rust **plugin** crates (wasm components, separate crates typically in `packages/*/*/plugin/`).

## How to run

1. **Change to the service crate root** (the directory that contains the service’s `Cargo.toml`), e.g.:
   - `packages/*/*/service/`

2. **Run tests** with the `cargo-psibase` binary (not `cargo psibase`):
   ```bash
   cargo-psibase test
   ```

3. **If `cargo-psibase` is not in PATH**, use the locally built binary:
   ```bash
   /path/to/psibase/build/rust/release/cargo-psibase test
   ```
   From the repo root, that is typically:
   `./build/rust/release/cargo-psibase test`

4. **Optional:** Filter tests by name:
   ```bash
   cargo-psibase test -- relay_tests
   ```

## Summary

| Item        | Value                                              |
|-------------|----------------------------------------------------|
| Working dir | Service crate root (e.g. `packages/*/*/service/`)  |
| Command     | `cargo-psibase test`                               |
| Binary      | Use `cargo-psibase` (not `cargo psibase`)          |
| Not for     | C++ services; Rust plugin crates                   |
