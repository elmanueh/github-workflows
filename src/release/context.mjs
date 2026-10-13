import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { output } from '../action-outputs.mjs'

export function validateContext(context, revision) {
  if (context.revision !== revision) throw new Error('Release context does not belong to this commit.')
  return context
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
      tag: process.env.RELEASE_TAG || ''
    }
    mkdirSync(contextDirectory(), { recursive: true })
    writeFileSync(contextFile(), JSON.stringify(context))
  } else {
    context = loadContext()
  }
  output({
    tag: context.tag,
    version: context.tag.slice(1),
    'image-name': `ghcr.io/${process.env.GITHUB_REPOSITORY.toLowerCase()}`,
    'has-release': Boolean(context.tag)
  })
  if (!context.tag) console.log('No release needed; this operation will be skipped.')
}
