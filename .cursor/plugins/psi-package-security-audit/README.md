# psi-package-security-audit

Cursor plugin that audits a psibase package's auth/security surface and writes a structured report to `/tmp/psi-package-security-audit.md`. Covers:

- Plugin functions: trust level and whitelist for each exported function.
- Service actions: caller restriction (e.g. `check_is_sender`, dynamic `<account>::isAuthSys` delegation, ad-hoc sender checks, or unrestricted) for each action, in both Rust and C++ services.
- Query (rpc) service: per-resolver auth check and `serveSys` caller restriction.

## Install

This plugin lives under `/root/agent-config/.cursor/plugins/psi-package-security-audit/` (authoritative source). Deploy via the `update-cursor-plugin` skill, which copies the entire directory to `/root/.cursor/plugins/local/psi-package-security-audit/`. Never symlink; never edit the deployed copy.

## Usage

In Agent chat:

```
/psi-package-security-audit Fractals
```

The skill resolves the package, delegates to the `auth-auditor` subagent, and the subagent writes the report.

## Layout

- `.cursor-plugin/plugin.json` — plugin manifest.
- `agents/auth-auditor.md` — the subagent that performs the analysis and writes the report.
- `skills/psi-package-security-audit/SKILL.md` — entry-point skill; thin delegator to the subagent.
