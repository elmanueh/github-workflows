import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { updateMajorTag } from '../src/release/update-major-tag.mjs'

function repository(t) {
  const directory = mkdtempSync(join(tmpdir(), 'action-major-tag-'))
  const remote = join(directory, 'remote.git')
  const checkout = join(directory, 'checkout')
  t.after(() => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected test directory')
    rmSync(directory, { recursive: true, force: true })
  })
  mkdirSync(checkout)
  execFileSync('git', ['init', '--bare', '--quiet', remote])
  const git = (args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Release Tests',
        '-c',
        'user.email=release@example.com',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'tag.gpgsign=false',
        ...args
      ],
      { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim()
  git(['init', '--quiet', '--initial-branch=main'])
  git(['remote', 'add', 'origin', remote])
  const remoteRef = (ref) => execFileSync('git', ['--git-dir', remote, 'rev-parse', ref], { encoding: 'utf8' }).trim()
  const release = (tag) => {
    git(['commit', '--quiet', '--allow-empty', '-m', `feat: ${tag}`])
    git(['tag', '--annotate', tag, '--message', tag])
    git(['push', 'origin', `refs/tags/${tag}:refs/tags/${tag}`])
    return git(['rev-parse', 'HEAD'])
  }
  return { git, release, remoteRef }
}

test('the first exact release creates its major tag at the same commit', (t) => {
  const repo = repository(t)
  const revision = repo.release('v1.0.0')

  const updated = updateMajorTag('v1.0.0', repo.git)

  assert.equal(updated, true)
  assert.equal(repo.remoteRef('refs/tags/v1'), revision)
})

test('compatible updates advance the major tag without changing exact tags', (t) => {
  const repo = repository(t)
  repo.release('v1.0.0')
  updateMajorTag('v1.0.0', repo.git)
  const original = repo.remoteRef('refs/tags/v1.0.0')
  const revision = repo.release('v1.1.0')
  const exact = repo.remoteRef('refs/tags/v1.1.0')

  updateMajorTag('v1.1.0', repo.git)

  assert.equal(repo.remoteRef('refs/tags/v1'), revision)
  assert.equal(repo.remoteRef('refs/tags/v1.0.0'), original)
  assert.equal(repo.remoteRef('refs/tags/v1.1.0'), exact)
})

test('a new major creates its own alias and preserves the previous major', (t) => {
  const repo = repository(t)
  const previous = repo.release('v1.1.0')
  updateMajorTag('v1.1.0', repo.git)
  const revision = repo.release('v2.0.0')

  updateMajorTag('v2.0.0', repo.git)

  assert.equal(repo.remoteRef('refs/tags/v1'), previous)
  assert.equal(repo.remoteRef('refs/tags/v2'), revision)
})

test('retrying an older release never moves the major tag backwards', (t) => {
  const repo = repository(t)
  repo.release('v1.0.0')
  const revision = repo.release('v1.2.0')
  updateMajorTag('v1.2.0', repo.git)

  const updated = updateMajorTag('v1.0.0', repo.git)

  assert.equal(updated, false)
  assert.equal(repo.remoteRef('refs/tags/v1'), revision)
})

test('an alias push failure can be retried without recreating the release', (t) => {
  const repo = repository(t)
  const previous = repo.release('v1.0.0')
  updateMajorTag('v1.0.0', repo.git)
  const revision = repo.release('v1.1.0')
  const interrupted = (args) => {
    if (args[0] === 'push') throw new Error('Network timeout')
    return repo.git(args)
  }

  assert.throws(() => updateMajorTag('v1.1.0', interrupted), /Network timeout/)
  assert.equal(repo.remoteRef('refs/tags/v1'), previous)
  updateMajorTag('v1.1.0', repo.git)

  assert.equal(repo.remoteRef('refs/tags/v1'), revision)
})

test('prerelease tags do not prevent publishing the latest stable major alias', (t) => {
  const repo = repository(t)
  const revision = repo.release('v1.0.0')
  repo.release('v1.1.0-beta.1')

  updateMajorTag('v1.0.0', repo.git)

  assert.equal(repo.remoteRef('refs/tags/v1'), revision)
})
