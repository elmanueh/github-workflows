import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateContext, validateBuildRecord } from '../src/release/context.mjs'

const identity = { repository: 'Example/App', revision: 'commit-a', runId: '123' }

const context = {
  schema: 1,
  ...identity,
  image: 'ghcr.io/example/app',
  tag: 'v1.2.3',
  version: '1.2.3',
  status: 'ready',
  digest: ''
}

const digest = 'sha256:' + 'a'.repeat(64)

test('ready, no-release and already-published contexts are accepted', () => {
  assert.equal(validateContext(context, identity), context)
  validateContext({ ...context, status: 'no-release', tag: '', version: '' }, identity)
  validateContext({ ...context, status: 'already-published', digest }, identity)
})

test('foreign or expired-run context cannot be used by another release', () => {
  for (const override of [
    { schema: 2 },
    { repository: 'other/app' },
    { revision: 'commit-b' },
    { runId: '124' },
    { image: 'ghcr.io/other/app' }
  ])
    assert.throws(() => validateContext({ ...context, ...override }, identity))

  for (const override of [
    { tag: 'latest' },
    { version: '9.9.9' },
    { status: 'invalid' },
    { status: 'already-published', digest: '' },
    { status: 'no-release' }
  ])
    assert.throws(() => validateContext({ ...context, ...override }, identity))
})

test('architecture records must match the release, workflow and architecture', () => {
  const record = { schema: 1, ...identity, image: context.image, tag: context.tag, architecture: 'amd64', digest }

  assert.equal(validateBuildRecord(record, context, 'amd64'), digest)

  for (const override of [
    { runId: '124' },
    { tag: 'v9.9.9' },
    { revision: 'commit-b' },
    { architecture: 'arm64' },
    { digest: 'invalid' }
  ])
    assert.throws(() => validateBuildRecord({ ...record, ...override }, context, 'amd64'))
})
