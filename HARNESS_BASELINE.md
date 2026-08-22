# DeepSeek Harness compatibility

- Repository: https://github.com/deepseek-ai/deepseek-harness
- Tag: `dsh-v0.1.1-rc.2`
- Commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Package version: `0.1.1-rc.2`
- Plugin kind: `Mixed`

Re-check public types, configuration rows, and any Client Slot, Settings, Credentials, or Remote contract before changing this baseline.

## Compatibility decisions

- The `skill-switch` Settings namespace is registered directly through `@deepseek-ai/dsh-settings`; this baseline exposes registered third-party namespaces without a core allowlist.
- The browser half mounts this package's generated `./remote` contribution through `ctx.remote.$mount`. It does not modify the built-in API Remote assembly.
- Typert `0.1.1-rc.2` discovers packages below a `packages/` workspace root. The build script creates a temporary package-shaped analysis workspace inside this repository, runs the public `WorkspaceTypertGenerator`, copies only its generated artifacts to `lib/`, and removes the temporary tree. A clean clone remains self-contained.
- `@deepseek-ai/dsh-skill-filesystem` at this baseline discovers directory Skills through Windows Junctions, so the next conversation can use a newly linked Skill.
