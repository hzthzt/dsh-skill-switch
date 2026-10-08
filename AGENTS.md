# Plugin Development

This repository contains one independently installable DeepSeek Harness plugin.

## Baseline

Target DSH `0.2.0-rc.2` — the harness embedded in the DSH Desktop application
(`@deepseek-ai/dsh-desktop-runtime` inside `resources/app.asar`). The local
aggregate workspace may contain a matching checkout, but this repository must
never depend on files outside its own root.

The Desktop app ships on the `nightly` update channel, so the installed runtime
can move ahead of this pin without a repository change. When it does, the
runtime's peer gate skips this bundle silently: re-baseline here, in
`package.json`'s `peerDependencies`, and in the `HARNESS_BASELINE.md` version
line together — `tests/contracts.test.ts` asserts they agree.

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
