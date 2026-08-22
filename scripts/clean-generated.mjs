import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const client = resolve(import.meta.dirname, '..', 'lib', 'client.js')
const source = await readFile(client, 'utf8')
await writeFile(client, source.replace(/[ \t]+$/gm, ''))
