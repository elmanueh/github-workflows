import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import getConfig from '../node_modules/semantic-release/lib/get-config.js'
import { isolatedRelease } from '../src/release/isolated-release.mjs'
import { ensureGithubRelease } from '../src/release/github-release.mjs'

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

  try {
    await isolatedRelease({
      gitDirectory,
      worktree: caller,
      env: process.env,
      repositoryUrl: 'https://github.com/example/app.git',
      run: async (options, context) => {
        isolatedDirectory = context.cwd
        assert.notEqual(context.cwd, caller)
        assert.equal(JSON.parse(readFileSync(join(context.cwd, '.releaserc.json'), 'utf8')).dryRun, false)

        const loaded = await getConfig(
          { ...context, logger: { log() {}, success() {}, error() {}, warn() {} } },
          options
        )
        assert.equal(loaded.options.dryRun, false)
        assert.equal(loaded.options.noCi, false)
        assert.deepEqual(loaded.options.branches, ['main'])
        assert.equal(context.env.GIT_WORK_TREE, caller)
        assert.equal(
          execFileSync('git', ['rev-parse', 'HEAD'], { cwd: context.cwd, env: context.env, encoding: 'utf8' }).trim(),
          head
        )
      }
    })
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
  tagRevision: 'commit-a',
  notes: async () => 'Release notes'
}

test('a tag without a GitHub release is recovered without creating another version', async () => {
  const calls = []
  await ensureGithubRelease(release, async (path, options) => {
    calls.push({ path, options })
    return options?.method === 'POST'
      ? { status: 201, data: { tag_name: release.tag, draft: false, prerelease: false } }
      : { status: 404 }
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.body.tag_name, 'v1.2.3')
  assert.equal(calls[1].options.body.target_commitish, 'commit-a')
  assert.equal(calls[1].options.body.body, 'Release notes')
})

test('an existing stable release is reused without a write', async () => {
  await ensureGithubRelease(release, async (path, options) => {
    assert.equal(options, undefined)
    return { status: 200, data: { tag_name: release.tag, draft: false, prerelease: false } }
  })
})

test('wrong commits, private API failures and draft releases cannot proceed to Docker', async () => {
  await assert.rejects(
    ensureGithubRelease({ ...release, tagRevision: 'another-commit' }, async () => {
      throw new Error('API must not be called')
    }),
    /does not point/
  )

  for (const response of [
    { status: 403, data: {} },
    { status: 200, data: { tag_name: release.tag, draft: true } },
    { status: 200, data: { tag_name: 'v9.9.9' } }
  ]) {
    await assert.rejects(
      ensureGithubRelease(release, async (path, options) => {
        assert.equal(options, undefined)
        return response
      }),
      /published stable GitHub release/
    )
  }
})
