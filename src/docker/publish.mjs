import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { architectures } from '../platforms.mjs'
import { assertDigest, docker, inspectRelease, verifyArchitecture } from './registry.mjs'
import { identity, output, summary } from '../action-outputs.mjs'
import { pathToFileURL } from 'node:url'
import { loadContext, contextDirectory } from '../release/context.mjs'

export function validateBuildRecord(record, context, architecture) {
  if (record.tag !== context.tag || record.revision !== context.revision) {
    throw new Error(`The ${architecture} build record does not belong to this release.`)
  }
  return assertDigest(record.digest)
}

export function publishImage(release, { loadDigests, run = docker, metadataFile }) {
  // Another completed attempt may already have published this exact release.
  const existing = inspectRelease(release, run)
  if (existing) return { digest: existing, state: 'Already published' }
  const digests = loadDigests()
  const sources = architectures.map((architecture) => {
    const reference = `${release.image}@${digests[architecture]}`
    verifyArchitecture(reference, architecture, release, run)
    return reference
  })
  // Workflow concurrency serializes writers of this release tag.
  run([
    'buildx',
    'imagetools',
    'create',
    '--tag',
    `${release.image}:${release.tag}`,
    '--metadata-file',
    metadataFile,
    ...sources
  ])
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'))
  const expected = metadata['containerimage.descriptor']?.digest
  const digest = inspectRelease(release, run)
  if (digest !== expected) throw new Error('Published digest does not match the manifest created by this run.')
  return { digest, state: 'Published image' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const release = identity()
  const context = loadContext()
  const result = publishImage(release, {
    loadDigests: () =>
      Object.fromEntries(
        architectures.map((arch) => [
          arch,
          validateBuildRecord(
            JSON.parse(readFileSync(join(contextDirectory(), 'digests', `${arch}.json`), 'utf8')),
            context,
            arch
          )
        ])
      ),
    metadataFile: join(process.env.RUNNER_TEMP, 'image-metadata.json')
  })
  output({ digest: result.digest })
  summary(result.state, release, result.digest)
}
