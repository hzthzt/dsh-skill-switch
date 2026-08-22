import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', types: 'src/types.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
  // Package mode lowers standard decorators here; the dedicated script emits
  // artifacts from its self-contained temporary workspace in the next step.
  plugins: [typertPlugin({ faces: ['host'] })],
})
