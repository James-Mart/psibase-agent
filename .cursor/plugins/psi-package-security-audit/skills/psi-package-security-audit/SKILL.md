---
name: psi-package-security-audit
description: Generates an auth/security audit report for a psibase package by delegating to the `auth-auditor` subagent. Covers plugin trust levels, service action restrictions, and query-service auth. Use when the user asks for a package auth audit, security audit, or trust audit by package name.
---

# Package security audit

Delegate the audit to the `auth-auditor` subagent. The subagent reads the package's plugin, service, and query-service sources and writes `/tmp/psi-package-security-audit.md`.

## Steps

1. Resolve the target package: accept either a package name (e.g. `Fractals`) or a directory path (e.g. `packages/user/Fractals`). If the user did not supply one, ask.

2. Launch the `auth-auditor` subagent via the Task tool:
   - `subagent_type`: `auth-auditor`
   - `description`: short title (e.g. `"Security audit: <Package>"`)
   - `prompt`: a self-contained instruction telling the subagent to audit the named package and write `/tmp/psi-package-security-audit.md`. Pass `Package: <name-or-path>`.

3. When the subagent finishes, briefly summarize the result and point the user at `/tmp/psi-package-security-audit.md`.

## Notes

- Audit-only. The subagent does not edit package source files; it only writes the report.
- If `/tmp/psi-package-security-audit.md` already exists, mention that it will be overwritten.
