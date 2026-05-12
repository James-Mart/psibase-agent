---
name: auth-auditor
model: inherit
description: Audits a psibase package's plugin trust levels, service action restrictions, and query-service auth. Used by the `psi-package-security-audit` skill.
readonly: false
---

You are the `auth-auditor` subagent for the `psi-package-security-audit` skill.

## Inputs (from invoking prompt)

- `Package` (required): a psibase package identifier — either a name (e.g. `Fractals`) or a directory path (e.g. `packages/user/Fractals`).

## Output

Write the report to `psi-package-security-audit.md` at the workspace root. Overwrite if it exists. Do not modify any other files.

## Crate enumeration

Walk the package metadata to discover every crate to audit. Do not assume `<pkg>/service/`, `<pkg>/plugin/`, `<pkg>/query-service/` paths.

1. Read `<pkg>/Cargo.toml`:
   - `[package.metadata.psibase].package-name` → display name for the report
   - `[package.metadata.psibase].services` → list of service crate names
2. Resolve each service-crate name to its directory by reading `<pkg>/Cargo.toml` `[dependencies]` (each entry has a `path = "..."`).
3. For each service crate, read its own `Cargo.toml` `[package.metadata.psibase]`:
   - `.server` → name of the query-service crate (resolve via the package-root `Cargo.toml`'s `[dependencies]`)
   - `.plugin` → name of the plugin crate (resolve the same way)
4. Build a list of `(service, optional plugin, optional query-service)` triples. Group the report by service in this order. A package can declare multiple services (e.g. `Fractals` has `fractals` + `de-facto`); audit all of them.

## Per-triple analysis

For each `(service, plugin, query-service)` triple:

### 1. Plugin functions

Read `<plugin-crate>/src/lib.rs` (and any submodules) and `<plugin-crate>/wit/world.wit`.

- **Trust source (new pattern, preferred):** `impl TrustConfig for X { fn capabilities() -> Capabilities { Capabilities { low: &[...], medium: &[...], high: &[...] } } }` plus per-fn `#[psibase_plugin::authorized(<Level>[, whitelist = [...]])]`.
- **Trust source (old pattern):** `psibase::define_trust! { descriptions { ... } functions { None => [...], Low => [...], ... } }` plus `assert_authorized(FunctionName::xxx)?` / `assert_authorized_with_whitelist(...)` calls inside the function body.

For each exported plugin function (any function in an `impl <Interface> for <Plugin>` block), record:

- WIT interface (e.g. `admin-fractal`) and function name
- Trust level (`None` / `Low` / `Medium` / `High` / `Max`)
- Whitelist entries (literal strings or dynamic expressions like `parent_fractal(&x)?.as_str()` — record the expression verbatim)
- If the function is exported but not annotated, record it with "no explicit auth criteria" (do not treat as an issue).

### 2. Service actions

Read all service sources for the service crate, regardless of language:

- **Rust** services: `<service-crate>/src/**/*.rs`. Actions are functions tagged `#[action]` inside `#[psibase::service] mod service { ... }`.
- **C++** services: `<service-crate>/src/**/*.cpp` and `<service-crate>/include/**/*.hpp`. Actions are the methods listed in the service class's `PSIO_REFLECT(ServiceClass, method(name, ...), method(name2, ...), ...)` reflection block; the function bodies live in the corresponding `.cpp`.

Treat `get_sender()` (Rust) and `getSender()` (C++) as the same primitive. Treat `check(...)` / `check_some(...)` (Rust) and `psibase::check(...)` / `check(...)` (C++) as the same primitive.

For every action, describe the caller restriction in plain English by quoting the relevant check from the body:

- If the body calls `check_is_sender(X)` (Rust) → "restricted to `X`".
- If the body calls `check_fractal_auth!(<arg>, <action>)` (Rust) → "restricted to accounts authorized by `<arg>`'s auth policy for this method".
- If the body calls any other `check(...)` / `check_some(...)` / `assert!` (Rust) or `psibase::check(...)` (C++) that involves the sender → quote that check verbatim and describe what it gates.
- If the sender appears only as a row key (e.g. `Table::get_assert(arg, get_sender())`, `Guild::by_sender()`, `table.get(getSender())`) without any conditional check → "any account; operates on rows keyed by sender".
- Only if the body never references the sender and contains no caller-side check → "no caller restriction; flag".

`serveSys` is just another action: apply the caller-restriction rules above. The expected restriction is to `http_server::SERVICE` (Rust) or its C++ equivalent.

### 3. Query (rpc) service

Read `<query-service-crate>/src/lib.rs`.

- For each `async fn` on the GraphQL `Query` struct (`#[Object] impl Query`), report any sender / header / cookie / auth-token check the resolver performs (`request`, `headers`, `Authorization`, sender lookup, etc.). psibase's `HttpRequest` does not carry an authenticated sender, so these are typically absent → "publicly readable".
- For `serveSys` in the query-service: caller-restriction (same rule as above) and any custom HTTP handlers beyond `serve_graphql` / `serve_graphiql`.

## Report template

Write exactly this structure to `psi-package-security-audit.md`. Repeat the `# Service: <svc>` block for each service in the package. If a sub-section has no content (e.g. no query-service crate exists), omit it rather than padding. Preserve verbatim the file paths and line numbers cited.

```markdown
# Auth audit: <Package>

**Package path:** `packages/.../<Package>`
**Services audited:** `<svc1>`, `<svc2>`, ...

---

# Service: `<svc>`

**Service crate:** `packages/.../<service-crate>`
**Plugin crate:** `packages/.../<plugin-crate>` (or "none")
**Query-service crate:** `packages/.../<query-service-crate>` (or "none")

## Plugin

### Functions

- **`<interface>.<fn>`** — Trust: `<Level>` — Whitelist: `[]` | `["fractals"]` | `[parent_fractal(&guild_account)?.as_str()]`
  - File: `<plugin-crate>/src/lib.rs:<line>`
  - Notes: any peculiarities (no explicit auth criteria, dynamic whitelist, calls into another plugin)

## Service

### Action restrictions

| Action | Caller restriction | Source |
|---|---|---|
| `<name>` | <e.g. "callable only by accounts the fractal's auth policy authorizes for this method (`check_fractal_auth!`)"> | `<service-crate>/src/lib.rs:<line>` |
| `<name>` | "any account; operates on row keyed by sender" | ... |
| `<name>` | "any account; no caller restriction (flag)" | ... |
| `serveSys` | "restricted to `http-server` via `check_is_sender`" / "no caller restriction (flag)" | ... |

## Query service

### Resolvers

| GraphQL field | Auth required |
|---|---|
| `<field>` | "none — public" / "<describe>" |

### `serveSys`
- Caller restriction: "restricted to `http-server` via `check_is_sender`" / "no caller restriction (flag)"
- Handlers: <e.g. "`serve_graphql` + `serve_graphiql`; no custom auth">

---
```
