import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { output } from '../docker/outputs.mjs'
import { assertDigest } from '../docker/registry.mjs'

export function validateContext(context, { repository, revision, runId }) {
  if (
    context.schema !== 1 ||
    context.repository !== repository ||
    context.revision !== revision ||
    context.runId !== runId
  ) {
    throw new Error('Release context does not belong to this repository, commit and workflow run.')
  }
  if (
    context.image !== `ghcr.io/${repository.toLowerCase()}` ||
    !['no-release', 'ready', 'already-published'].includes(context.status)
  ) {
    throw new Error('Invalid release context.')
  }
  if (context.status === 'no-release') {
    if (context.tag || context.version || context.digest)
      throw new Error('No-release context must not contain a version or image.')
  } else {
    if (
      !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(context.tag || '') ||
      context.version !== context.tag.slice(1)
    ) {
      throw new Error('Invalid version in release context.')
    }
    if (context.status === 'already-published') assertDigest(context.digest)
    else if (context.digest) throw new Error('Unpublished release context must not contain a digest.')
  }
  return context
}

export function validateBuildRecord(record, context, architecture) {
  if (
    record.schema !== 1 ||
    record.architecture !== architecture ||
    !['repository', 'runId', 'image', 'tag', 'revision'].every((key) => record[key] === context[key])
  ) {
    throw new Error(`The ${architecture} build record does not belong to this release and workflow run.`)
  }
  return assertDigest(record.digest)
}

export const contextDirectory = () => join(process.env.RUNNER_TEMP, 'release-actions')
export const contextFile = () => join(contextDirectory(), 'release.json')

export function loadContext() {
  return validateContext(JSON.parse(readFileSync(contextFile(), 'utf8')), {
    repository: process.env.GITHUB_REPOSITORY,
    revision: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let context
  if (process.argv[2] === 'save') {
    const tag = process.env.RELEASE_TAG || ''
    const digest = process.env.IMAGE_DIGEST || ''
    context = {
      schema: 1,
      repository: process.env.GITHUB_REPOSITORY,
      revision: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      image: `ghcr.io/${process.env.GITHUB_REPOSITORY.toLowerCase()}`,
      tag,
      version: tag ? tag.slice(1) : '',
      digest,
      status: !tag ? 'no-release' : digest ? 'already-published' : 'ready'
    }
    validateContext(context, { repository: context.repository, revision: context.revision, runId: context.runId })
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
    version: context.version,
    'image-name': context.image,
    'has-release': context.status !== 'no-release',
    'should-build': context.status === 'ready',
    digest: context.digest
  })
  if (context.status === 'no-release') console.log('No release needed; this operation will be skipped.')
  else if (context.status === 'already-published')
    console.log('Release was already published; architecture builds are skipped.')
}
