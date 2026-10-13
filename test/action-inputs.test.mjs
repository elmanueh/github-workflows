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

test('all public operations derive the repository image automatically', () => {
  for (const operation of ['create-release', 'build-image', 'publish-image'])
    assert.equal(validateInputs({ ...valid, operation }), 'ghcr.io/example/my-app')
})

test('unsupported operation, branch or runner fails before release work', () => {
  for (const operation of ['prepare', 'build', 'publish', 'deploy', undefined])
    assert.throws(() => validateInputs({ ...valid, operation }), /operation must be/)

  for (const ref of ['refs/heads/develop', 'refs/tags/v1.0.0', undefined])
    assert.throws(() => validateInputs({ ...valid, ref }), /main branch/)

  for (const platform of ['win32', 'darwin'])
    assert.throws(() => validateInputs({ ...valid, platform }), /Linux runner/)

  for (const repository of ['owner', 'owner/repo:tag', 'owner/repo\nother', undefined])
    assert.throws(() => validateInputs({ ...valid, repository }), /GITHUB_REPOSITORY/)
  assert.throws(() => validateInputs({ ...valid, operation: 'build-image', architecture: 's390x' }), /native Linux/)
  assert.equal(validateInputs({ ...valid, operation: 'build-image', architecture: 'arm64' }), 'ghcr.io/example/my-app')
})

test('release script rejects a non-main invocation before Git or API access', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/release/release.mjs', import.meta.url))], {
    env: { ...process.env, GITHUB_REF: 'refs/heads/develop' },
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /main branch/)
})
