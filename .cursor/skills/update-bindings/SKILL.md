---
name: update-bindings
description: Syncs C++ service headers (`**/cpp/include/*/*/*.hpp`) and Rust client stubs (`rust/psibase/src/services/*.rs`) with a canonical `#[action]` in `packages/**/service/src/lib.rs`. Use when an action’s signature or `///` docs change, the user links or cites `lib.rs` at a line, or asks to update or refresh service bindings.
---

# Update service bindings

Keeps generated-style C++ and `rust/psibase` service bindings aligned with the Rust package service that defines the action.

## When to apply

- The user changed or points at a `#[action] fn` in `packages/**/service/src/lib.rs` (often `@path:line`).
- They ask to refresh, add, or fix bindings for that action.

## Canonical source

Treat the **linked or pasted** action as authoritative:

- All `///` lines immediately above the `fn` (including `# Arguments` bullets if present).
- The full signature: `fn <name>(<params>)` and return type, if any.
- Ignore `#[action]` and the function body.

Infer the **service** from the path, e.g. `.../VirtualServer/service/src/lib.rs` → `VirtualServer`.

## Locating binding files

From the repository root:

1. **C++:** glob `**/cpp/include/*/*/*.hpp` (e.g. `packages/system/VirtualServer/service/cpp/include/services/system/VirtualServer.hpp`).
2. **Rust client:** glob `rust/psibase/src/services/*.rs`; if missing, try `rust/psibase/services/*.rs`.

Edit the `.hpp` and the **snake_case** `.rs` whose name matches the service (`VirtualServer` → `virtual_server.rs`). If several `.hpp` files match the glob, only the one for that service.

## C++ header

- Find the declaration for the same action name, or add it next to related actions (e.g. other `use*Sys` methods).
- Declare as `void <name>(<params>);` using the **same method name** as the Rust action (camelCase on both sides here).
- Copy Rust `///` into C++ `///` above the declaration; keep list and `# Arguments` structure consistent with **neighboring** methods in that file.
- For C++ parameter types and namespaces, **match sibling declarations** in that header; do not introduce new structs or types the header does not already use.
- If the header registers actions via a reflect macro using `method(...)` entries (e.g. `PSIO_REFLECT`), add or update the matching `method(<name>, <param-names...>)` line.

## Rust client

Inside `#[crate::service(...)] mod service { ... }`:

- Add or update the `#[action] fn` with the **same name and parameter list** as the service.
- Mirror the source `///` block (Rust doc style).
- Keep `unimplemented!()` bodies unless the user explicitly requests real behavior.
- Preserve module attributes, imports, and ordering consistent with **adjacent** actions.

## Verification

- After edits, the action name and parameter **types and order** match the canonical service definition.

## Scope

- Only touch binding files for the affected service; do not change unrelated actions or make formatting-only edits.
- If no binding file exists for that service, report that; do not create new service binding files unless the user asked for an end-to-end new service.
