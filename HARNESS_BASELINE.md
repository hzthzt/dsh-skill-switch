# DeepSeek Harness compatibility

- Repository: https://github.com/deepseek-ai/deepseek-harness
- Package version: `0.2.0-rc.2`
- Plugin kind: `Mixed`

The pinned version is the one shipped inside the DSH Desktop application: the
running harness is the `@deepseek-ai/dsh-desktop-runtime@0.2.0-rc.2` tree
embedded in `resources/app.asar`, not the `dsh` CLI on `PATH`.

Re-check public types, configuration rows, and any Client Slot, Settings,
Credentials, or Remote contract before changing this baseline.

## Compatibility decisions

- Peer versions are pinned exactly, including the `@deepseek-ai/dsh*` entries
  that the runtime gate evaluates. `evaluatePluginCompatibility()` skips a
  bundle whose dsh peers do not satisfy the running version and reports it only
  through `skippedBundles`, so a stale pin fails silently rather than loudly.
  `tests/contracts.test.ts` re-reads the version from this file so the pin, the
  manifest, and this document cannot drift apart.
- The plugin owns its configuration. `0.2.0-rc.2` removed the per-namespace
  `settingsNamespace`/`ctx.settings.register` seam in favour of `SettingsForms`
  keyed by profile entry id and restricted to `.volatile()` fields, so
  `src/config.ts` persists `storePath` to `$DSH_HOME/skill-switch/config.json`
  beside the ownership manifest instead of depending on that subsystem.
- The browser half mounts this package's generated `./remote` contribution
  through `ctx.remote.$mount` and registers a `settings.section` entry owned by
  `@deepseek-ai/dsh-client-ui-settings`. It does not modify the built-in API
  Remote assembly, and `slots` is provided by
  `@deepseek-ai/dsh-client-ui-renderer` (it is not re-exported by
  `dsh-client-ui-slots` any more).
- Client contexts are typed as the plain Cordis `Context`; the
  `@deepseek-ai/dsh-client-runtime` package no longer exists in this baseline.
- Typert `0.2.0-rc.2` strict codecs carry a success-cached `create()` factory
  (plus optional `decode`/`encode`) rather than a `schema` property, and the
  loader, registry, and Gateway all reject the old shape. The build script
  creates a temporary package-shaped analysis workspace inside this repository,
  runs the public `WorkspaceTypertGenerator`, copies only its generated
  artifacts to `lib/`, and removes the temporary tree. A clean clone remains
  self-contained.
- Product icons were renamed from size-suffixed names (`IconSearchOutline16`)
  to weight-suffixed ones (`IconSearchOutlineRegular`) across the client
  packages.
- `@deepseek-ai/dsh-skill-filesystem` at this baseline discovers directory
  Skills through Windows Junctions, so the next conversation can use a newly
  linked Skill.

## Recovery when the desktop app moves ahead of this pin

The desktop app updates on the `nightly` channel. If it installs a version this
package does not pin, the bundle is skipped and the Settings section disappears.
Either re-baseline this repository, or accept the risk explicitly for the exact
installed package and runtime version:

```sh
dsh plugin --profile desktop allow-version dsh-skill-switch@0.2.0 --dsh-version <running> --accept-risk
```
