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

for (const [name, messages, expected] of [
  ['fix creates a patch', ['fix: repair health check'], 'patch'],
  ['feat creates a minor', ['feat(api): add endpoint'], 'minor'],
  ['breaking feat header creates a major', ['feat!: replace response format'], 'major'],
  ['breaking scoped fix creates a major', ['fix(api)!: change authentication'], 'major'],
  ['breaking footer creates a major', ['feat: replace API\n\nBREAKING CHANGE: old endpoints removed'], 'major'],
  ['maintenance commits skip release', ['docs: explain installation', 'chore: update tooling'], null],
  ['highest change wins', ['fix: repair request', 'feat: add route', 'feat!: remove old route'], 'major']
]) {
  test(name, async () => {
    const result = await analyze(messages)

    assert.equal(result, expected)
  })
}
