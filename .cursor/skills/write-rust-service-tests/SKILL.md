---
name: write-rust-service-tests
description: Write psibase package service unit tests. Use when adding tests to a `packages/*/*/service/src` Rust crate.
---

# Package Service Unit Tests

## What this skill does
- Classifies a proposed unit test as either **pure library** (`#[test]`) or **chain-backed** (`#[psibase::test_case(packages("..."))]`).
- Writes new tests by patterning on the existing `Tokens` unit tests in `packages/user/Tokens/service/src/tests.rs` (notably `test_to_fixed` vs `test_basics`).

## Classification rules (use these first)
1. **Pure library test** (`#[test]`): Use when the test only exercises deterministic helper/library code (e.g. string/number conversions, pure computations) and does not require a `psibase::Chain`.
2. **Chain-backed test** (`#[psibase::test_case(packages("..."))]`): Use when the test needs runtime state, such as:
   - installing/initializing a package via service wrappers (e.g. calling `Wrapper::push(&chain).init()`)
   - creating accounts, logging in, calling service wrapper actions that mutate on-chain state
   - registering servers / making chain-GraphQL calls
   - finishing blocks / relying on chain execution

## Model patterns from `Tokens` (the template)
When writing new tests, mirror these structural cues:
1. **Pure helper example**: `test_to_fixed`
   - Is a plain Rust test: `#[test] fn test_to_fixed() { ... }`
   - Calls a helper directly (e.g. `crate::helpers::to_fixed`)
   - Uses `assert_eq!` and returns nothing
2. **Chain integration examples**: `test_basics`, `test_reject`, `test_subaccounts`
   - Are chain-backed tests: `#[psibase::test_case(packages("Tokens"))]`
   - Take a chain argument: `fn test_x(chain: psibase::Chain) -> Result<(), psibase::Error>`
   - Perform initialization like `Wrapper::push(&chain).init();`
   - Create accounts with `chain.new_account(...)`
   - Use `Wrapper::push_from(&chain, account)` (and service-specific wrappers) to drive behavior

## Writing new tests (step-by-step)
1. Open the target service test module (usually `#[cfg(test)] mod tests { ... }` in `service/src/tests.rs`). Create this file if it doesn't exist.
2. Split tests into two conceptual groups:
   - **Library / helper tests**: add `#[test]` functions (no `chain` parameter).
   - **Runtime / chain tests**: add `#[psibase::test_case(packages("<PackageName>"))]` functions (with `chain: psibase::Chain` and `-> Result<(), psibase::Error>`).
3. For **library tests**:
   - Import the helper(s) under test (like `crate::helpers::...`).
   - Prefer direct assertions (`assert_eq!`, `assert!`) and return `()`.
4. For **chain-backed tests**:
   - Use the correct `packages("...")` string for the package(s) your test needs (match the crate/service package name style used in `Tokens` tests).
   - Initialize the wrapper/service under test early in the test (pattern: `Wrapper::push(&chain).init();`).
   - Drive behavior through wrapper methods, and assert on observable outputs (e.g. query results, expected error messages).
5. If error assertions are needed:
   - Prefer the same style used in `Tokens` tests: helper functions that extract and assert on error trace/messages (for chain errors) or `unwrap_err()` string matching (for fallible query calls).

## Output expectations
- The agent should add tests that compile and follow the same macro/structure separation as `Tokens`:
  - `#[test]` for pure helpers
  - `#[psibase::test_case(packages("..."))]` + `psibase::Chain` for runtime behavior

## Examples

For concrete patterns (modeled after `Tokens`), see [examples.md](examples.md).

## Required test run (always)

1. After writing/adding the unit tests, run the test suite using the existing Cursor skill `run-rust-service-tests`.

