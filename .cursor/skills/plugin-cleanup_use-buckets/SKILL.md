---
name: plugin-cleanup_use-buckets
description: Migrate a psibase plugin from the legacy `clientdata:plugin` keyvalue interface to the `host:db` Bucket interface. Use when the user asks to drop the clientdata dependency, switch a plugin to host:db, or use the host bucket interface.
---

# Migrate a plugin from `clientdata` to `host:db` buckets

Mechanical, behavior-preserving for new data. Existing client-side records become inaccessible after the swap by design (no migration).

## Steps

### 1. `Cargo.toml`

Under `[package.metadata.component.target.dependencies]`, replace `clientdata:plugin` with `host:db` (adjust relative path):

```toml
"host:db" = { path = "../../Host/plugin/db/wit/world.wit" }
```

### 2. `wit/impl.wit`

```wit
include host:db/imports;
```

in place of `include clientdata:plugin/imports;`.

### 3. Source

Drop `use crate::bindings::clientdata::plugin::keyvalue as Keyvalue;`. Add a per-table opener that constructs a `Bucket` (`NonTransactional` + `Persistent` matches `clientdata`'s internal semantics):

```rust
use crate::bindings::host::db::store::{Bucket, Database, DbMode, StorageDuration};

fn contacts_table() -> Bucket {
    Bucket::new(
        Database {
            mode: DbMode::NonTransactional,
            duration: StorageDuration::Persistent,
        },
        "contacts",
    )
}
```

Translate call sites: `Keyvalue::{get,set,delete}(k, ...)` → `contacts_table().{get,set,delete}(k, ...)`. `Bucket::get` returns `Option<Vec<u8>>` like `Keyvalue::get`.

### 4. Naming

Buckets are already namespaced by the calling plugin, so do **not** name the bucket after the plugin (e.g. don't use `"profiles"` from inside `Profiles/plugin`). Treat the identifier as a **table name** for the records inside (e.g. `"contacts"`, `"keys"`). Must match `^[0-9a-zA-Z_-]+$`.

Name the opener function semantically too — not `bucket()`. Try to match the table name (`_table` suffix if name collisions).

If the file uses key-prefix conventions under `clientdata` to fake multiple tables in one keyspace, split them into one `Bucket` per table on migration (one opener function each), and drop the per-key prefix.
