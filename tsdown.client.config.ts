import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  minify: true,
  clean: false,
  deps: {
    neverBundle: (specifier: string) => specifier.startsWith('@deepseek-ai/')
      || specifier === 'react' || specifier === 'react-dom' || specifier === 'react/jsx-runtime',
    alwaysBundle: (specifier: string) => specifier === 'zod',
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-skill-switch", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
