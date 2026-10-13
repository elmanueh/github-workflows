import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeCommits } from '@semantic-release/commit-analyzer'
import { analyzerOptions } from '../src/release/release-config.mjs'

const analyze = (messages) =>
  analyzeCommits(analyzerOptions, {
    cwd: process.cwd(),
    commits: messages.map((message, index) => ({ message, hash: String(index) })),
    logger: { log() {} }
  })

test('fix creates a patch and feat creates a minor release', async () => {
  assert.equal(await analyze(['fix: repair health check']), 'patch')
  assert.equal(await analyze(['feat(api): add endpoint']), 'minor')
})

test('breaking headers and BREAKING CHANGE footers create a major release', async () => {
  assert.equal(await analyze(['feat!: replace response format']), 'major')
  assert.equal(await analyze(['fix(api)!: change authentication']), 'major')
  assert.equal(await analyze(['feat: replace API\n\nBREAKING CHANGE: old endpoints removed']), 'major')
})

test('maintenance commits skip releases and the highest change wins', async () => {
  assert.equal(await analyze(['docs: explain installation', 'chore: update tooling']), null)
  assert.equal(await analyze(['fix: repair request', 'feat: add route', 'feat!: remove old route']), 'major')
})
