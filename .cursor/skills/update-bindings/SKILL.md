---
name: update-bindings
description: Syncs C++ service headers (`**/cpp/include/*/*/*.hpp`) and Rust client stubs (`rust/psibase/src/services/*.rs`) with a canonical `#[action]` in `packages/**/service/src/lib.rs`. Use when an action's signature or `///` docs change, the user links or cites `lib.rs` at a line, or asks to update or refresh service bindings.
---

# Update service bindings

Canonical source: the `#[action] fn` (signature + `///` docs) in `packages/**/service/src/lib.rs`.

## Binding files to edit

1. **C++ header:** glob `**/cpp/include/*/*/*.hpp` for the matching service.
   - Declare as `<return_type> <name>(<params>);`. Mirror `///` docs. Match sibling types/namespaces.
   - If the header has a `PSIO_REFLECT` macro, add/update the `method(<name>, <param-names...>)` entry.
2. **Rust client:** `rust/psibase/src/services/<snake_case_service>.rs`.
   - Add/update `#[action] fn` inside the `#[crate::service(...)] mod service` block. Use `unimplemented!()` bodies.

## Rules

- Only touch binding files for the affected service. Don't create new binding files unless asked.
- Match style, ordering, and formatting of neighboring declarations in each file.
