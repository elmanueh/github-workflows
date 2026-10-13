import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { generateNotes } from '@semantic-release/release-notes-generator'
import { isolatedRelease } from './isolated-release.mjs'
import { ensureGithubRelease } from './github-release.mjs'
import { parserOpts } from './release-config.mjs'
import { output } from '../action-outputs.mjs'

export async function createRelease({
  run = isolatedRelease,
  recover = ensureGithubRelease,
  cwd = process.cwd()
} = {}) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const revision = process.env.GITHUB_SHA
  const repositoryUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}.git`
  const result = await run({
    gitDirectory: git(['rev-parse', '--absolute-git-dir']),
    worktree: cwd,
    env: process.env,
    repositoryUrl
  })
  let tag = result?.nextRelease?.gitTag
  if (!tag) {
    const candidates = git(['tag', '--points-at', 'HEAD', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'])
      .split('\n')
      .filter((value) => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    if (candidates.length > 1)
      throw new Error('Multiple stable release tags point to this commit; recovery is ambiguous.')
    tag = candidates[0]
  }
  if (tag && !result?.nextRelease) {
    await recover({
      repository: process.env.GITHUB_REPOSITORY,
      tag,
      revision,
      notes: async () => {
        const parent = git(['rev-list', '--parents', '-n', '1', tag]).split(' ')[1]
        const previous = parent
          ? git(['tag', '--merged', parent, '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'])
              .split('\n')
              .find((value) => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
          : undefined
        const parts = git(['log', previous ? `${previous}..${tag}` : tag, '--format=%H%x00%B%x00']).split('\0')
        const commits = []
        for (let index = 0; index + 1 < parts.length; index += 2) {
          if (parts[index].trim()) commits.push({ hash: parts[index].trim(), message: parts[index + 1].trim() })
        }
        return generateNotes(
          { parserOpts },
          {
            cwd,
            commits,
            lastRelease: previous ? { gitTag: previous } : {},
            nextRelease: { gitTag: tag, version: tag.slice(1), gitHead: revision },
            options: { repositoryUrl },
            logger: { log() {} }
          }
        )
      }
    })
  }
  return tag
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tag = await createRelease()
  output({ tag: tag || '', version: tag?.slice(1) || '' })
  if (!tag) console.log('No release needed.')
}
