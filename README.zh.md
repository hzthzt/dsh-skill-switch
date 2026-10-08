# dsh-skill-switch

[English](README.md) | 简体中文

仅适用于 Windows 的 DeepSeek Harness Web Skill 管理插件。插件扫描一个中央目录，并通过目录 Junction（目录联接）将选中的用户全局 Skill 暴露到 `$DSH_HOME/skills`。

默认中央目录为 `~/.cc-switch/skills`。版本 `0.2.0` 面向 DSH `0.2.0-rc.2`。

## 功能范围

- 仅管理用户全局 DSH Skills。
- 接受直接采用 `<directory>/SKILL.md` 结构的目录包，并通过 frontmatter 名称识别 Skill。
- 仅创建和移除 Windows Junction。
- 不会安装、更新、编辑或删除中央目录中的 Skills。
- 不会接管 `$DSH_HOME/skills` 中已有的文件、目录或链接。
- 不管理项目 Skills 或其他 Agent。

## 安装

将经过审查的提交安装到 DSH profile：

```sh
dsh plugin --profile <profile> add github:hzthzt/dsh-skill-switch#<commit-sha>
dsh --profile <profile> --dump-config
dsh --profile <profile> web
```

仓库已提交 `lib/`，因此从 Git 安装时无需运行构建脚本。也可以安装本地 tarball：

```sh
pnpm pack
dsh plugin --profile <profile> add ./dsh-skill-switch-0.2.0.tgz
```

插件将其 DSH peer 依赖精确锁定到基线版本。若当前运行的 harness 版本不匹配，DSH 会跳过该 bundle（Skills 页不会出现）；此时可以重新对齐基线，或用 `dsh plugin --profile <profile> allow-version dsh-skill-switch@0.2.0 --dsh-version <运行版本> --accept-risk` 显式接受该版本差异。

打开 DSH 设置，然后选择 **Skills**。

## Skill 格式

插件只扫描中央目录下一层。作为链接的源目录和链接形式的 `SKILL.md` 文件会被忽略。源目录可以使用任意名称；`SKILL.md` frontmatter 中的 `name` 是 Skill 的规范身份，并且必须采用 kebab-case：

```text
central-directory/
`-- example-skill-main/
    `-- SKILL.md
```

```yaml
---
name: example-skill
description: 一段非空的描述。
---
```

启用此示例会创建 `$DSH_HOME/skills/example-skill`，并使其指向 `central-directory/example-skill-main`。如果多个有效源目录声明了相同的 frontmatter 名称，所有重复条目都会报告为无效，直到名称歧义被消除。

配置的中央目录路径必须是 Windows 绝对路径，或以 `~` 开头。插件不会展开 `%USERPROFILE%` 等环境变量表达式。中央目录和 `$DSH_HOME/skills` 不能互相包含。

## 状态

| 状态 | 含义 | 可执行操作 |
| --- | --- | --- |
| `available` | 中央目录中存在有效 Skill，目标位置没有同名条目 | 可以启用 |
| `enabled` | Junction 由本插件创建，且所有权校验通过 | 可以停用 |
| `conflict` | 目标位置已有同名的外部管理条目 | 只读 |
| `invalid` | Skill 文件/frontmatter 无效，或多个源声明了相同名称 | 只读；已受管的条目除外 |
| `broken` | 受管源已消失，或不再声明记录中的 Skill | 可以安全停用 |

`~/.dsh/skills/nai-fadian` 等已有普通目录仍由外部管理。如果中央目录中存在同名 Skill，插件会将其报告为冲突，并禁用对应开关。

## 安全模型

所有权记录保存在 `$DSH_HOME/skill-switch/manifest.json`，配置的中央目录保存在 `$DSH_HOME/skill-switch/config.json`。这两份文档都带有版本号、经过严格校验，并以原子替换方式写入。每条 manifest 记录都包含本插件所创建 Junction 的源路径和文件系统标识。

移除前，插件会校验 Skill 名称，重新计算 `$DSH_HOME/skills` 下的目标路径，确认目标仍是具有记录标识的链接，并核对其指向。目标缺失时，对应记录会从 manifest 中清除；目标被替换后，插件会放弃其所有权并将其显示为外部管理。受管 Skill 会同时按 frontmatter 名称和记录的源路径匹配，因此移动源目录后，必须先停用旧来源，才能启用新路径。插件绝不会删除源 Skill。

所有扫描和变更操作共用一个串行队列。仍有任何通过校验的受管 Junction 时，插件会拒绝更改中央目录；请先使用 **停用全部**。在非 Windows 主机上，Remote 返回 `unsupported-platform`，且不会进行任何文件系统变更。

## 开发

使用 Node.js 24 和 `pnpm@11.7.0`：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
git diff --exit-code -- lib
pnpm pack
```

构建会运行固定版本的 Typert 生成器，生成的 `lib/` 文件会有意提交到仓库。Windows 测试使用真实 Junction；Ubuntu 测试任务验证构建行为以及明确的 `unsupported-platform` 返回结果。

## 许可证

MIT
