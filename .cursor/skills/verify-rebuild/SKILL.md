---
name: verify-rebuild
description: Verify whether a psibase build artifact includes your source changes. Use when a test or deployment seems to run stale code, or when you need to confirm a rebuild picked up your edits.
---

# Verify rebuild

## .psi packages are compressed

`.psi` files are compressed archives. Running `strings` on them will **not** show source-level strings. To verify content, check the **uncompressed** service wasm instead:

```bash
strings packages/<tier>/target/wasm32-wasip1/release/<service-name>.wasm | grep <expected_string>
```

Use the hyphenated name (e.g. `virtual-server.wasm`), not the underscore name (`virtual_server.wasm`) -- the hyphenated file is the polyfilled wasm that gets packaged.