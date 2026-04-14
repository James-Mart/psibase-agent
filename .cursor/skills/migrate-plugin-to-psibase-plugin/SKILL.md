---
name: migrate-plugin-to-psibase-plugin
description: Migrate a psibase plugin to use the psibase_plugin crate. Use when the user asks to migrate, convert, or simplify a plugin by adopting psibase_plugin, or when a plugin still uses define_trust!, plugin_error!, or add_action_to_transaction patterns.
---

# Migrate Plugin to `psibase_plugin`

Behavior-preserving migration replacing boilerplate with `psibase_plugin` helpers.

## Pre-flight

1. Identify the plugin crate root: `packages/**/plugin/`.
2. Confirm the plugin does **not** already depend on `psibase_plugin`.
3. Read `Cargo.toml`, `src/lib.rs`, `src/errors.rs` (if any), and `wit/impl.wit` (or `wit/world.wit`).

## Migration steps

Apply each step in order. Skip any step that does not apply to the target plugin.

### 1. `Cargo.toml`

Add dependencies:
```toml
psibase_plugin.workspace = true
thiserror.workspace = true
```

Add type remappings:
```toml
[package.metadata.component.bindings.with]
"host:types/types" = "psibase_plugin::types"
```

If the plugin uses `host:db/store` types directly (`Bucket`, `Database`, `DbMode`, `StorageDuration`), also add:
```toml
"host:db/store" = "psibase_plugin::host::store"
```

Remove from `[package.metadata.component.target.dependencies]` (now transitive via `psibase_plugin`):
- `"host:common"`, `"host:db"`, `"host:crypto"`, `"host:prompt"`
- `"transact:plugin"` (keep if `impl.wit` still has `transact:plugin/hook-actions-sender` or similar)
- `"permissions:plugin"`

### 2. `wit/impl.wit`

Remove these includes (now supplied by `psibase_plugin`):
```wit
include host:common/imports;
include host:db/imports;
include host:crypto/imports;
include host:prompt/imports;
include transact:plugin/imports;
include permissions:plugin/imports;
```

Keep non-host plugin includes, `export` declarations, and `include .../hook-*` declarations.

### 3. Errors — `plugin_error!` to derive macros

Before:
```rust
use psibase::plugin_error;

plugin_error! {
    pub ErrorType
    AmountIsZero = 1 => "Amount is zero",
    ConversionError(msg: String) => "Conversion error: {msg}",
}
```

After:
```rust
#[derive(Debug, psibase_plugin::ErrorEnum, thiserror::Error)]
#[repr(u32)]
pub enum ErrorType {
    #[error("Amount is zero")]
    AmountIsZero = 1,
    #[error("Conversion error: {0}")]
    ConversionError(String),
}
```

- Preserve enum name, variant names, discriminant values, and messages.
- Named fields (`msg: String`) become positional (`(String)`) with `{0}` in `#[error()]`.
- Remove lifetime parameters (`<'a>`, `&'a str`); use `String` instead.

### 4. Trust / authorization — `define_trust!` to `TrustConfig` + `#[authorized]`

#### 4a. Replace `define_trust!` with `TrustConfig` impl

Before:
```rust
psibase::define_trust! {
    descriptions {
        Low => "- Capability A",
        Medium => "- Capability B",
        High => "- Capability C",
    }
    functions {
        None => [fn_a],
        Low => [fn_b],
        Medium => [fn_c],
        High => [fn_d],
        Max => [fn_e],
    }
}
```

After:
```rust
use psibase_plugin::{trust::*, *};

impl TrustConfig for MyPlugin {
    fn capabilities() -> Capabilities {
        Capabilities {
            low: &["Capability A"],
            medium: &["Capability B"],
            high: &["Capability C"],
        }
    }
}
```

Strip leading `- ` from each capability bullet; each array entry is one capability string.

#### 4b. Annotate functions with `#[psibase_plugin::authorized(...)]`

Replace `assert_authorized(FunctionName::xxx)?` calls with an attribute:

```rust
#[psibase_plugin::authorized(Medium)]
fn my_func() -> Result<(), Error> { Ok(()) }
```

With whitelist:
```rust
#[psibase_plugin::authorized(High, whitelist = ["app1"])]
fn my_func() -> Result<(), Error> { Ok(()) }
```

Map trust levels from the old `functions` block. For functions that used `is_authorized` / `is_authorized_with_whitelist` (returning `bool`), use `psibase_plugin::trust::authorized::<Self>(...)` or `authorized_with_whitelist::<Self>(...)` directly.

Delete `use crate::trust::*;` and the entire `define_trust!` block.

### 5. Host imports — `bindings::host::*` to `psibase_plugin::host::*`

| Old path | New path |
|---|---|
| `bindings::host::common::server` | `psibase_plugin::host::server` |
| `bindings::host::common::client` | `psibase_plugin::host::client` |
| `bindings::host::crypto::keyvault::*` | `psibase_plugin::host::crypto::*` |
| `bindings::host::db::store` | `psibase_plugin::host::store` |
| `bindings::host::prompt::api` | `psibase_plugin::host::prompt` |
| `bindings::host::types::types` | `psibase_plugin::types` |

`use psibase_plugin::*;` brings `Error`, `host`, `Transact`, and other common items into scope.

### 6. Transaction building — `add_action_to_transaction` to `Wrapper::add_to_tx()`

Before:
```rust
use bindings::transact::plugin::intf::add_action_to_transaction;
use my_service::action_structs as Actions;
use psibase::fracpack::Pack;

add_action_to_transaction(
    Actions::some_action::ACTION_NAME,
    &Actions::some_action { field1, field2 }.packed(),
)?;
```

After:
```rust
use psibase_plugin::*;
use my_service::Wrapper as MyService;

MyService::add_to_tx().some_action(field1, field2);
```

- `add_to_tx()` returns a typed action builder. The `Transact` trait comes from `psibase_plugin`.
- Remove `use psibase::fracpack::Pack;` if only needed for `.packed()`.
- The old code returned `Result`; the new code panics on failure. Add `Ok(())` at the end of the function body if needed.

### 7. Prompt API — typed `get_context` / `prompt`

Before:
```rust
let context = HostPrompt::get_context().unwrap();
let parsed = MyContext::unpacked(&context).unwrap();
```

After:
```rust
use psibase_plugin::host::prompt;
let parsed = prompt::get_context::<MyContext>().unwrap();
```

Before:
```rust
HostPrompt::prompt("name", Some(&context.packed()));
```

After (`prompt` accepts `Option<&impl Pack>`, packs automatically):
```rust
prompt::prompt("name", Some(&context));
```

### 8. Clean up imports

- Remove `use bindings::*;` blanket imports superseded by `psibase_plugin::*`.
- Remove `use psibase::fracpack::Pack;` if no longer used directly.
- Keep `use bindings::exports::...` and `use bindings::<other_plugin>::...` for non-host plugin interfaces.

## Verification

After making all changes:
1. Check lints with `ReadLints` on all modified files.
2. Confirm no behavioral changes: the same WIT exports remain, function signatures are unchanged, error codes/messages are identical.
