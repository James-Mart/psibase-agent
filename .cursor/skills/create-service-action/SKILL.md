---
name: create-service-action
description: Author a new psibase service action in Rust or C++. Use when adding an `#[action]` to `packages/**/service/src/lib.rs`, declaring a new method on a C++ service, or when the user asks to add, create, or design a service action.
---

# Create a service action

## Naming rules (must follow)

- **Length:** action name must be **<= 14 characters** in all languages. (Longer names still encode, but psibase silently falls back to a hash, which breaks readable bindings.)
- **Casing by language:**
  - **C++ services:** `camelCase` (e.g. `initBilling`, `setSpecs`).
  - **Rust services:** `snake_case` (e.g. `init_billing`, `set_specs`).
- The two casings refer to the **same on-chain action**; binding generators map between them. The snake_case form is always the longer of the two, so checking it against the 14-char limit is sufficient.

## Security: always decide who can call the action

Every new action must answer: **who is allowed to call this?** Pick one of these patterns before writing the body.

### Pattern A: assert the sender is authorized

Use when the action mutates global/service-owned state, performs privileged operations, or should only be invoked by the service itself, a specific account, or an admin role.

Rust:

```rust
#[action]
fn set_specs(specs: ServerSpecs) {
    check(get_sender() == get_service(), "Unauthorized");
    ServerSpecs::set(&specs);
}
```

C++ (in the service `.cpp`):

```cpp
void MyService::setSpecs(ServerSpecs specs)
{
   check(getSender() == getReceiver(), "Wrong sender");
   ServerSpecs::set(specs);
}
```

Common variants:
- `get_sender() == get_service()` / `getSender() == getReceiver()` — only the service itself.
- `get_sender() == <admin account>` — only a designated admin.
- Look up sender in a permissions table and `check(...)` it.

### Pattern B: open to anyone, scope state to the sender

Use when the action manages **per-user** data (the user's own balance, settings, subscription, etc.). Don't gate the call; instead, key all reads/writes by `get_sender()` so callers can only affect their own rows.

Rust:

```rust
#[action]
fn set_pref(pref: UserPref) {
    let user = get_sender();
    UserPrefTable::new().put(&UserPrefRow { user, pref }).unwrap();
}
```

Never accept an `account` parameter and use it as the row key without first checking it equals `get_sender()` (or that the sender is otherwise authorized to act on that account's behalf). Doing so lets any caller mutate any user's data.

## Authoring checklist

1. Name the action: snake_case (Rust) or camelCase (C++), <= 14 chars.
2. Decide and implement the security pattern (A or B above) **before** the business logic.
3. Add the `#[action]` (Rust) or declare the method on the service struct and reflect it via `PSIO_REFLECT(Service, method(<name>, <params...>))` (C++).
4. Add `///` doc comments describing what the action does and the security expectation ("Only callable by ...", or "Operates on the caller's own ...").
5. After the action signature is final, sync bindings using the `update-bindings` skill.
6. Add or update tests using `write-rust-service-tests` (Rust) and run them via `run-rust-service-tests` (Rust) or `run-catch2-test` (C++).

## Anti-patterns

- Action name longer than 14 characters (gets silently hashed, losing the readable name in bindings).
- Using snake_case in a C++ service or camelCase in a Rust service.
- Mutating per-user state keyed by an `account` parameter without verifying the sender.
- Privileged action with no `check(...)` on the sender.
