import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadContext, contextDirectory } from '../release/context.mjs'

const context = loadContext()
const architecture = process.env.ARCHITECTURE
const directory = join(contextDirectory(), 'digests')
mkdirSync(directory, { recursive: true })
writeFileSync(
  join(directory, `${architecture}.json`),
  JSON.stringify({
    tag: context.tag,
    revision: context.revision,
    digest: process.env.IMAGE_DIGEST
  })
)
