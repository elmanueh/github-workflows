import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { output } from '../docker/outputs.mjs'
import { assertDigest } from '../docker/registry.mjs'

export function validateContext(context, revision) {
  if (context.revision !== revision) throw new Error('Release context does not belong to this commit.')
  return context
}

export function validateBuildRecord(record, context, architecture) {
  if (record.tag !== context.tag || record.revision !== context.revision) {
    throw new Error(`The ${architecture} build record does not belong to this release.`)
  }
  return assertDigest(record.digest)
}

export const contextDirectory = () => join(process.env.RUNNER_TEMP, 'release-actions')
export const contextFile = () => join(contextDirectory(), 'release.json')

export function loadContext() {
  return validateContext(JSON.parse(readFileSync(contextFile(), 'utf8')), process.env.GITHUB_SHA)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let context
  if (process.argv[2] === 'save') {
    context = {
      revision: process.env.GITHUB_SHA,
      tag: process.env.RELEASE_TAG || '',
      digest: process.env.IMAGE_DIGEST || ''
    }
    mkdirSync(contextDirectory(), { recursive: true })
    writeFileSync(contextFile(), JSON.stringify(context))
  } else {
    context = loadContext()
    if (process.env.OPERATION === 'build-image') {
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      if (head !== context.revision) throw new Error('Build checkout does not match the release commit.')
    }
  }
  output({
    tag: context.tag,
    version: context.tag.slice(1),
    'image-name': `ghcr.io/${process.env.GITHUB_REPOSITORY.toLowerCase()}`,
    'has-release': Boolean(context.tag),
    'should-build': Boolean(context.tag && !context.digest),
    digest: context.digest
  })
  if (!context.tag) console.log('No release needed; this operation will be skipped.')
  else if (context.digest) console.log('Release was already published; architecture builds are skipped.')
}
