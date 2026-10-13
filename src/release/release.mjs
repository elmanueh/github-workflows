import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import semanticRelease from 'semantic-release'
import config from './release-config.mjs'

const branch = 'main'
if (process.env.GITHUB_REF !== `refs/heads/${branch}`) {
  throw new Error(`Run this release workflow from the ${branch} branch.`)
}

const repositoryUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}.git`
const result = await semanticRelease({ ...config, branches: [branch], repositoryUrl }, { cwd: process.cwd() })
let tag = result?.nextRelease.gitTag
let version = result?.nextRelease.version

// Recover a release whose Docker build failed after its tag was created.
if (!result) {
  tag = execFileSync('git', ['tag', '--points-at', 'HEAD', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'], {
    encoding: 'utf8'
  })
    .trim()
    .split('\n')
    .find((value) => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
  if (tag) {
    execFileSync('gh', ['release', 'view', tag, '--json', 'tagName'], {
      env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
      stdio: 'pipe'
    })
    version = tag.slice(1)
  }
}

if (tag && !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
  throw new Error(`Invalid stable release tag: ${tag}`)
}

appendFileSync(process.env.GITHUB_OUTPUT, `published=${Boolean(tag)}\ntag=${tag || ''}\nversion=${version || ''}\n`)
if (!tag) console.log('No releasable changes; Docker publication will be skipped.')
