import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, rmdirSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateContext } from '../src/release/context.mjs'
import { validateBuildRecord } from '../src/docker/publish.mjs'

const context = { revision: 'commit-a', tag: 'v1.2.3' }
const digest = 'sha256:' + 'a'.repeat(64)

test('context belongs to the current commit', () => {
  const result = validateContext(context, 'commit-a')

  assert.equal(result, context)
})

test('context from a different commit is rejected', () => {
  assert.throws(() => validateContext(context, 'commit-b'), /does not belong/)
})

test('build record returns its validated digest', () => {
  const record = { revision: context.revision, tag: context.tag, digest }

  const result = validateBuildRecord(record, context, 'amd64')

  assert.equal(result, digest)
})

for (const [name, override, error] of [
  ['tag', { tag: 'v9.9.9' }, /does not belong/],
  ['commit', { revision: 'commit-b' }, /does not belong/],
  ['digest', { digest: 'invalid' }, /Invalid image digest/]
]) {
  test(`build record rejects the wrong ${name}`, () => {
    const record = { revision: context.revision, tag: context.tag, digest, ...override }

    assert.throws(() => validateBuildRecord(record, context, 'amd64'), error)
  })
}

function runner(t) {
  const directory = mkdtempSync(join(tmpdir(), 'release-context-'))
  const outputFile = join(directory, 'output')
  const releaseFile = join(directory, 'release-actions', 'release.json')
  mkdirSync(join(directory, 'release-actions'))
  t.after(() => {
    for (const file of [outputFile, releaseFile]) rmSync(file, { force: true })
    rmdirSync(join(directory, 'release-actions'))
    rmdirSync(directory)
  })
  const env = {
    ...process.env,
    RUNNER_TEMP: directory,
    GITHUB_OUTPUT: outputFile,
    GITHUB_SHA: context.revision,
    GITHUB_REPOSITORY: 'Example/App',
    OPERATION: 'publish-image'
  }
  const script = fileURLToPath(new URL('../src/release/context.mjs', import.meta.url))
  return {
    outputFile,
    releaseFile,
    run: (args = [], overrides = {}) =>
      spawnSync(process.execPath, [script, ...args], { env: { ...env, ...overrides }, encoding: 'utf8' })
  }
}

for (const [name, tag] of [
  ['release', 'v1.2.3'],
  ['no release', '']
]) {
  test(`save and load ${name} preserves public outputs`, (t) => {
    const mock = runner(t)

    const saved = mock.run(['save'], { RELEASE_TAG: tag })
    writeFileSync(mock.outputFile, '')
    const loaded = mock.run()

    assert.equal(saved.status, 0, saved.stderr)
    assert.equal(loaded.status, 0, loaded.stderr)
    assert.deepEqual(JSON.parse(readFileSync(mock.releaseFile, 'utf8')), {
      revision: context.revision,
      tag
    })
    const outputs = readFileSync(mock.outputFile, 'utf8')
    assert.ok(outputs.includes(`version=${tag.slice(1)}\n`))
    assert.ok(outputs.includes(`has-release=${Boolean(tag)}\n`))
    assert.ok(outputs.includes('image-name=ghcr.io/example/app\n'))
  })
}

for (const [name, contents, error] of [
  ['missing', undefined, /ENOENT/],
  ['invalid JSON', 'not json', /SyntaxError/]
]) {
  test(`${name} context fails loading`, (t) => {
    const mock = runner(t)
    if (contents !== undefined) writeFileSync(mock.releaseFile, contents)

    const result = mock.run()

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, error)
  })
}
