---
name: read-cpp-tables
description: Reads psibase tables in C++ using service-level database APIs and typed table wrappers. Use when reading table data, opening `DbId` databases, querying `Table` or `TableIndex`, or when touching `proxyKvOpen` usage in C++.
---

# Read C++ Tables

## Core rule

Prefer service-level DB access (`to<Db>().open(...)`, or `to<XDb>().open(...)` for local independent DBs) and typed table wrappers.

Do not call `proxyKvOpen(...)` directly from service/business logic. It is an internal bridge used by table plumbing; in service builds it dispatches to `to<SystemService::Db>().open(...)` or `to<LocalService::XDb>().open(...)`.

## Preferred patterns

1. If a typed wrapper exists, use it first:
   - `MyServiceTables{account}.open<MyTable>()`
   - `Native::tables(...).open<SomeTable>()`
   - `Native::subjective(...).open<SomeTable>()`

2. If you need a raw handle for index access, open via service API:
   - system DBs (e.g. `DbId::blockLog`): `to<SystemService::Db>().open(db, prefix, mode)`
   - node-local DBs: `to<LocalService::XDb>().open(db, prefix, mode)`

3. Build `TableIndex`/table objects from that handle; avoid introducing new direct `proxyKvOpen` calls.

## Checklist

- [ ] Searched for existing wrappers before opening a DB directly.
- [ ] Used `to<Db>().open`/`to<XDb>().open` at call sites in service logic.
- [ ] Avoided adding new `proxyKvOpen` usage outside table internals.
- [ ] Kept DB mode (`KvMode::read` vs write) explicit.
