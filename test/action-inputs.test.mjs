import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateInputs } from '../src/action-inputs.mjs'

const valid = {
  operation: 'create-release',
  repository: 'Example/My-App',
  ref: 'refs/heads/main',
  platform: 'linux',
  architecture: 'x64'
}

for (const operation of ['create-release', 'build-image', 'publish-image']) {
  test(`${operation} derives image and native architecture`, () => {
    const inputs = { ...valid, operation }

    const result = validateInputs(inputs)

    assert.deepEqual(result, { image: 'ghcr.io/example/my-app', architecture: 'amd64' })
  })
}

for (const [key, values, error] of [
  ['operation', ['prepare', 'build', 'publish', 'deploy', undefined], /operation must be/],
  ['ref', ['refs/heads/develop', 'refs/tags/v1.0.0', undefined], /main branch/],
  ['platform', ['win32', 'darwin'], /Linux runner/]
]) {
  for (const value of values) {
    test(`rejects ${key}=${value}`, () => {
      const inputs = { ...valid, [key]: value }

      assert.throws(() => validateInputs(inputs), error)
    })
  }
}

test('build rejects an unsupported native architecture', () => {
  const inputs = { ...valid, operation: 'build-image', architecture: 's390x' }

  assert.throws(() => validateInputs(inputs), /native Linux/)
})

test('build accepts a native arm64 runner', () => {
  const inputs = { ...valid, operation: 'build-image', architecture: 'arm64' }

  const result = validateInputs(inputs)

  assert.equal(result.architecture, 'arm64')
})

test('release rejects the wrong checkout before API access', () => {
  const script = fileURLToPath(new URL('../src/release/release.mjs', import.meta.url))
  const env = { ...process.env, GITHUB_SHA: 'another-commit', GITHUB_TOKEN: '' }

  const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Checkout must use the commit/)
})
