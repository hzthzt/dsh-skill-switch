# Plugin Development

This repository contains one independently installable DeepSeek Harness plugin.

## Baseline

Target `dsh-v0.1.1-rc.2` at commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. The local aggregate workspace may contain a matching checkout, but this repository must never depend on files outside its own root.

## Rules

- Use Node.js 24, `pnpm@11.7.0`, PowerShell 7 on Windows, and English Git branch names.
- Follow the repository's source and tests first, then the official source and documentation at the pinned commit.
- This is an installable `dsh.bundle`, not a `dsh.profile` or session-local dynamic Cordis plugin.
- Keep `cordis.patch.yml`, package exports, and built files aligned.
- Commit `lib/`; CI rebuilds it and rejects drift.
- Use Cordis lifecycle APIs for registrations and dispose external resources explicitly.
- Do not import from parent directories, sibling repositories, or unpublished workspace-only packages.
- Prefer focused tests that are expected to pass. Run typecheck, tests, build, and pack before publishing.
- Never commit credentials.
