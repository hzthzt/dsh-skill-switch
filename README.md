# dsh-skill-switch

English | [简体中文](README.zh.md)

Windows-only Skill management for DeepSeek Harness Web. The plugin scans one central directory and selectively exposes user-global Skills in `$DSH_HOME/skills` through directory Junctions.

The default central directory is `~/.cc-switch/skills`. Version `0.2.0` targets DSH `0.2.0-rc.2`.

## Scope

- Manages user-global DSH Skills only.
- Accepts direct `<directory>/SKILL.md` directory bundles and identifies them by frontmatter name.
- Creates and removes Windows Junctions only.
- Never installs, updates, edits, or deletes central Skills.
- Never adopts existing files, directories, or links in `$DSH_HOME/skills`.
- Does not manage project Skills or other agents.

## Install

Install a reviewed commit into a DSH profile:

```sh
dsh plugin --profile <profile> add github:hzthzt/dsh-skill-switch#<commit-sha>
dsh --profile <profile> --dump-config
dsh --profile <profile> web
```

The repository commits `lib/`, so Git installation does not need to run a build script. A local tarball can be installed instead:

```sh
pnpm pack
dsh plugin --profile <profile> add ./dsh-skill-switch-0.2.0.tgz
```

The plugin pins its DSH peers to the exact baseline version. If the running harness does not match, DSH skips the bundle (the Skills section simply does not appear); either re-baseline this repository or accept the mismatch explicitly with `dsh plugin --profile <profile> allow-version dsh-skill-switch@0.2.0 --dsh-version <running> --accept-risk`.

Open DSH Settings and select **Skills**.

## Skill format

The central directory is scanned one level deep. Source directory links and linked `SKILL.md` files are ignored. A source directory may use any name; the `SKILL.md` frontmatter `name` is the canonical Skill identity and must be kebab-case:

```text
central-directory/
`-- example-skill-main/
    `-- SKILL.md
```

```yaml
---
name: example-skill
description: A non-empty description.
---
```

Enabling this example creates `$DSH_HOME/skills/example-skill`, which points to `central-directory/example-skill-main`. If multiple valid source directories declare the same frontmatter name, every duplicate is reported as invalid until the ambiguity is removed.

The configured central path must be a Windows absolute path or start with `~`. Environment-variable expressions such as `%USERPROFILE%` are not expanded. The central directory and `$DSH_HOME/skills` cannot contain one another.

## States

| State | Meaning | Action |
| --- | --- | --- |
| `available` | Valid central Skill with no target entry | Can be enabled |
| `enabled` | Junction is owned and verified by this plugin | Can be disabled |
| `conflict` | An external target already uses the same name | Read-only |
| `invalid` | The Skill file/frontmatter is invalid, or multiple sources declare the same name | Read-only unless already managed |
| `broken` | The managed source disappeared or no longer declares the recorded Skill | Can be disabled safely |

Existing ordinary directories such as `~/.dsh/skills/nai-fadian` remain externally managed. A same-named central Skill is reported as a conflict and its toggle is disabled.

## Safety model

Ownership records are stored in `$DSH_HOME/skill-switch/manifest.json`, and the configured central directory in `$DSH_HOME/skill-switch/config.json`. Both documents are versioned, strictly validated, and replaced atomically. Every manifest record includes the source and filesystem identity of the Junction created by this plugin.

Before removal, the plugin validates the Skill name, recomputes the target under `$DSH_HOME/skills`, verifies that the target is still a link with the recorded identity, and verifies its destination. A missing target is pruned from the manifest. A replaced target loses ownership and is displayed as external. A managed Skill is matched by both its frontmatter name and recorded source path, so moving a source requires disabling it before the new path can be enabled. Source Skills are never removed.

All scans and mutations share one serial queue. Changing the central directory is refused while any verified managed Junction remains; use **Disable all** first. On non-Windows hosts, the Remote returns `unsupported-platform` and performs no filesystem mutation.

## Development

Use Node.js 24 and `pnpm@11.7.0`:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
git diff --exit-code -- lib
pnpm pack
```

The build runs the pinned Typert generator and commits `lib/` artifacts intentionally. Windows tests use real Junctions; the Ubuntu test job verifies build behavior and the explicit unsupported-platform result.

## License

MIT
