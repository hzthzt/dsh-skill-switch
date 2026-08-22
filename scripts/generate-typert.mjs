import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(import.meta.dirname, '..')
const workspace = join(root, '.typert-build')
const packageRoot = join(workspace, 'packages', 'dsh-skill-switch')

await rm(workspace, { recursive: true, force: true })
try {
  await mkdir(packageRoot, { recursive: true })
  await cp(join(root, 'src'), join(packageRoot, 'src'), { recursive: true })
  await writeFile(join(workspace, 'package.json'), JSON.stringify({
    name: 'dsh-skill-switch-typert-workspace', private: true, type: 'module',
  }, null, 2))
  await writeFile(join(workspace, 'tsconfig.base.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
      composite: true, noEmit: true, allowImportingTsExtensions: true, skipLibCheck: true,
      verbatimModuleSyntax: true, jsx: 'react-jsx', types: ['node'],
      paths: {
        '@deepseek-ai/dsh-typert-protocol': ['./typert-protocol.d.ts'],
      },
    },
  }, null, 2))
  await writeFile(join(workspace, 'tsconfig.host.json'), JSON.stringify({
    extends: './tsconfig.base.json', files: [],
    references: [{ path: './packages/dsh-skill-switch' }],
  }, null, 2))
  await cp(join(root, 'scripts', 'typert-protocol.d.ts'), join(workspace, 'typert-protocol.d.ts'))
  await writeFile(join(packageRoot, 'tsconfig.json'), JSON.stringify({
    extends: '../../tsconfig.base.json', include: ['src/*.ts'],
  }, null, 2))
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  manifest.main = './src/index.ts'
  manifest.types = './src/index.ts'
  manifest.exports['.'] = './src/index.ts'
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest, null, 2))

  const generator = new WorkspaceTypertGenerator(workspace)
  const discovered = generator.discover(['host'])
  const artifacts = generator.generate(['dsh-skill-switch'], ['host'])
  const artifact = artifacts.find(candidate => candidate.package === 'dsh-skill-switch' && candidate.face === 'host')
  if (artifact?.remote === undefined) {
    throw new Error(`Typert did not generate the skillSwitch Remote contract: discovered=${JSON.stringify(discovered)} artifacts=${JSON.stringify(artifacts.map(value => ({ package: value.package, face: value.face, remote: value.remote !== undefined })))}`)
  }
  const clean = value => value.replace(/[ \t]+$/gm, '')
  await writeFile(join(root, 'lib', 'typert.host.js'), clean(artifact.js))
  await writeFile(join(root, 'lib', 'typert.host.d.ts'), clean(artifact.dts))
  await writeFile(join(root, 'lib', 'typert.remote-client.js'), clean(artifact.remote.js))
  await writeFile(join(root, 'lib', 'typert.remote-client.d.ts'), clean(artifact.remote.dts))
  await writeFile(join(root, 'lib', 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
} finally {
  await rm(workspace, { recursive: true, force: true })
}
