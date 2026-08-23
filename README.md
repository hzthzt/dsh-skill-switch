# dsh-skill-switch

English | [简体中文](README.zh.md)

Windows-only Skill management for DeepSeek Harness Web. The plugin scans one central directory and selectively exposes user-global Skills in `$DSH_HOME/skills` through directory Junctions.

The default central directory is `~/.cc-switch/skills`. Version `0.1.0` targets DSH `dsh-v0.1.1-rc.2` at commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

## Scope

- Manages user-global DSH Skills only.
- Accepts direct `<name>/SKILL.md` directory bundles.
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
dsh plugin --profile <profile> add ./dsh-skill-switch-0.1.0.tgz
```

Open DSH Settings and select **Skills**.

## Skill format

The central directory is scanned one level deep. Source directory links and linked `SKILL.md` files are ignored. A valid Skill uses a kebab-case directory name and matching YAML frontmatter:

```text
central-directory/
`-- example-skill/
    `-- SKILL.md
```

```yaml
---
name: example-skill
description: A non-empty description.
---
```

The configured central path must be a Windows absolute path or start with `~`. Environment-variable expressions such as `%USERPROFILE%` are not expanded. The central directory and `$DSH_HOME/skills` cannot contain one another.

## States

| State | Meaning | Action |
| --- | --- | --- |
| `available` | Valid central Skill with no target entry | Can be enabled |
| `enabled` | Junction is owned and verified by this plugin | Can be disabled |
| `conflict` | An external target already uses the same name | Read-only |
| `invalid` | Directory or frontmatter validation failed | Read-only unless already managed |
| `broken` | The source disappeared while the owned Junction remains | Can be disabled safely |

Existing ordinary directories such as `~/.dsh/skills/nai-fadian` remain externally managed. A same-named central Skill is reported as a conflict and its toggle is disabled.

## Safety model

Ownership records are stored in `$DSH_HOME/skill-switch/manifest.json`. The manifest is versioned, strictly validated, and replaced atomically. Every record includes the source and filesystem identity of the Junction created by this plugin.

Before removal, the plugin validates the Skill name, recomputes the target under `$DSH_HOME/skills`, verifies that the target is still a link with the recorded identity, and verifies its destination. A missing target is pruned from the manifest. A replaced target loses ownership and is displayed as external. Source Skills are never removed.

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
