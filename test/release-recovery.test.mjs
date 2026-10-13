import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import getConfig from '../node_modules/semantic-release/lib/get-config.js'
import { isolatedRelease } from '../src/release/isolated-release.mjs'
import { ensureGithubRelease, githubApi } from '../src/release/github-release.mjs'
import { createRelease } from '../src/release/release.mjs'

test('a successful semantic-release publication returns its tag without querying GitHub again', async () => {
  const run = async () => ({ nextRelease: { gitTag: 'v1.2.3' } })
  const recover = async () => {
    throw new Error('Recovery must not run after publication')
  }

  const tag = await createRelease({ run, recover })

  assert.equal(tag, 'v1.2.3')
})

test('a failed semantic-release publication fails the run without rollback', async () => {
  const run = async () => {
    throw new Error('GitHub publish failed')
  }
  const recover = async () => {
    throw new Error('Recovery belongs to the next attempt')
  }

  await assert.rejects(createRelease({ run, recover }), /GitHub publish failed/)
})

function repository(t, tags = []) {
  const directory = mkdtempSync(join(tmpdir(), 'release-retry-'))
  t.after(() => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected test directory')
    rmSync(directory, { recursive: true, force: true })
  })
  const git = (args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  git(['init', '--quiet', '--initial-branch=main'])
  git([
    '-c',
    'user.name=Release Tests',
    '-c',
    'user.email=release@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'feat: initial release'
  ])
  for (const tag of tags) git(['tag', tag])
  return directory
}

test('a retry uses the existing tag instead of generating another version', async (t) => {
  const cwd = repository(t, ['v1.2.3'])
  const calls = []
  const run = async () => false
  const recover = async (release) => {
    calls.push(release)
  }

  const tag = await createRelease({ cwd, run, recover })

  assert.equal(tag, 'v1.2.3')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].tag, tag)
})

test('no releasable changes and no tag finish without recovery', async (t) => {
  const cwd = repository(t)
  const run = async () => false
  const recover = async () => {
    throw new Error('No release to recover')
  }

  const tag = await createRelease({ cwd, run, recover })

  assert.equal(tag, undefined)
})

test('multiple stable tags on the same commit make recovery ambiguous', async (t) => {
  const cwd = repository(t, ['v1.2.3', 'v1.2.4'])
  const run = async () => false
  const recover = async () => {
    throw new Error('Ambiguous recovery must not run')
  }

  await assert.rejects(createRelease({ cwd, run, recover }), /recovery is ambiguous/)
})

test('application dryRun, extensions and executable config cannot affect centralized release', async () => {
  const caller = mkdtempSync(join(tmpdir(), 'release-config-caller-'))
  writeFileSync(
    join(caller, 'package.json'),
    JSON.stringify({ release: { dryRun: true, extends: ['missing-module'] } })
  )
  writeFileSync(join(caller, '.releaserc.cjs'), 'throw new Error("Application release config must not execute")')

  const gitDirectory = resolve(execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim())

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  let isolatedDirectory
  let observed

  try {
    await isolatedRelease({
      gitDirectory,
      worktree: caller,
      env: process.env,
      repositoryUrl: 'https://github.com/example/app.git',
      run: async (options, context) => {
        isolatedDirectory = context.cwd
        const loaded = await getConfig(
          { ...context, logger: { log() {}, success() {}, error() {}, warn() {} } },
          options
        )
        observed = {
          config: JSON.parse(readFileSync(join(context.cwd, '.releaserc.json'), 'utf8')),
          options: loaded.options,
          worktree: context.env.GIT_WORK_TREE,
          head: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: context.cwd,
            env: context.env,
            encoding: 'utf8'
          }).trim()
        }
      }
    })

    assert.notEqual(isolatedDirectory, caller)
    assert.deepEqual(observed.config, {})
    assert.equal(observed.options.dryRun, false)
    assert.equal(observed.options.noCi, false)
    assert.deepEqual(observed.options.branches, ['main'])
    assert.equal(observed.worktree, caller)
    assert.equal(observed.head, head)
    assert.throws(() => readFileSync(join(isolatedDirectory, '.releaserc.json')), /ENOENT/)
  } finally {
    rmSync(join(caller, 'package.json'))
    rmSync(join(caller, '.releaserc.cjs'))
    rmdirSync(caller)
  }
})

const release = {
  repository: 'example/app',
  tag: 'v1.2.3',
  revision: 'commit-a',
  notes: async () => 'Release notes'
}

test('a tag without a GitHub release is recovered without creating another version', async () => {
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return options?.method === 'POST'
      ? { status: 201, data: { tag_name: release.tag, draft: false, prerelease: false } }
      : { status: 404 }
  }

  await ensureGithubRelease(release, api)

  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.body.tag_name, 'v1.2.3')
  assert.equal(calls[1].options.body.target_commitish, 'commit-a')
  assert.equal(calls[1].options.body.body, 'Release notes')
})

test('an existing stable release is reused without a write', async () => {
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return { status: 200, data: { draft: false, prerelease: false } }
  }

  await ensureGithubRelease(release, api)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].options, undefined)
})

for (const state of ['draft', 'prerelease']) {
  test(`an existing ${state} release is rejected`, async () => {
    const api = async () => ({ status: 200, data: { [state]: true } })

    await assert.rejects(ensureGithubRelease(release, api), /published stable GitHub release/)
  })
}

for (const [method, status] of [
  ['GET', 403],
  ['GET', 500],
  ['POST', 404]
]) {
  test(`GitHub ${method} HTTP ${status} fails in the API adapter`, async () => {
    const request = async () => ({ ok: false, status })

    await assert.rejects(githubApi('/repos/example/app/releases', { method }, request), new RegExp(`HTTP ${status}`))
  })
}

test('a missing release can be recovered after the API reports GET 404', async () => {
  const writes = []
  const request = async (url, options) => {
    if (options.method === 'GET') return { ok: false, status: 404, json: async () => ({}) }
    writes.push(JSON.parse(options.body))
    return { ok: true, status: 201, json: async () => ({ draft: false, prerelease: false }) }
  }
  const api = (path, options) => githubApi(path, options, request)

  await ensureGithubRelease(release, api)

  assert.equal(writes.length, 1)
  assert.equal(writes[0].tag_name, release.tag)
})
