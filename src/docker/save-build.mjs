import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadContext, contextDirectory } from '../release/context.mjs'
import { assertDigest } from './registry.mjs'
import { architectures } from '../platforms.mjs'

const context = loadContext()
const architecture = process.env.ARCHITECTURE
if (!architectures.includes(architecture) || context.status !== 'ready')
  throw new Error('Unexpected architecture build.')
const directory = join(contextDirectory(), 'digests')
mkdirSync(directory, { recursive: true })
writeFileSync(
  join(directory, `${architecture}.json`),
  JSON.stringify({
    schema: 1,
    repository: context.repository,
    runId: context.runId,
    image: context.image,
    tag: context.tag,
    revision: context.revision,
    architecture,
    digest: assertDigest(process.env.IMAGE_DIGEST)
  })
)
