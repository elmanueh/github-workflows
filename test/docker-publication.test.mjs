import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { architectures } from '../src/platforms.mjs'
import { inspectRelease, isMissingManifest } from '../src/docker/registry.mjs'
import { publishImage } from '../src/docker/publish.mjs'

const digest = (character) => `sha256:${character.repeat(64)}`

const release = {
  image: 'ghcr.io/example/app',
  tag: 'v1.2.3',
  revision: 'commit-a',
  source: 'https://github.com/example/app'
}

const children = Object.fromEntries(architectures.map((arch, index) => [arch, digest(String(index + 1))]))

const manifest = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: [
    ...architectures.map((arch) => ({ digest: children[arch], platform: { os: 'linux', architecture: arch } })),
    {
      digest: digest('b'),
      platform: { os: 'unknown', architecture: 'unknown' },
      annotations: { 'vnd.docker.reference.type': 'attestation-manifest' }
    }
  ]
}
manifest.digest = `sha256:${createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}`

function registry({
  exists = false,
  inspectionError,
  configRevision = release.revision,
  configVersion = release.tag.slice(1),
  configSource = release.source,
  descriptor = manifest,
  metadataDigest = manifest.digest,
  failAfterCreate = false
} = {}) {
  const calls = []

  let failure = false

  const run = (args) => {
    calls.push(args)
    if (args[2] === 'create') {
      exists = true
      failure = failAfterCreate
      writeFileSync(
        args[args.indexOf('--metadata-file') + 1],
        JSON.stringify({
          'containerimage.descriptor': { digest: metadataDigest }
        })
      )
      return ''
    }
    if (args[5] === '{{json .Image}}') {
      const arch = architectures.find((candidate) => args[3].endsWith(children[candidate]))
      return JSON.stringify({
        os: 'linux',
        architecture: arch,
        config: {
          Labels: {
            'org.opencontainers.image.version': configVersion,
            'org.opencontainers.image.revision': configRevision,
            'org.opencontainers.image.source': configSource
          }
        }
      })
    }
    if (failure) {
      failure = false
      throw new Error('dial tcp: network timeout')
    }
    if (inspectionError) throw new Error(inspectionError)
    if (!exists) throw new Error(`ERROR: ${release.image}:${release.tag}: not found`)

    const { digest: ignored, ...raw } = descriptor
    return JSON.stringify(raw)
  }
  return { run, calls }
}

function publication(mock) {
  const directory = mkdtempSync(join(tmpdir(), 'release-publication-'))

  const metadataFile = join(directory, 'metadata.json')

  try {
    return publishImage(release, {
      run: mock.run,
      metadataFile,
      loadDigests: () => children
    })
  } finally {
    rmSync(metadataFile, { force: true })
    rmdirSync(directory)
  }
}

test('only explicit missing-manifest responses authorize publication', () => {
  const reference = `${release.image}:${release.tag}`

  for (const message of [`ERROR: ${reference}: not found`, 'manifest unknown: manifest unknown', 'no such manifest']) {
    assert.equal(isMissingManifest(message, reference), true)
  }

  for (const message of [
    'unauthorized',
    'denied: manifest unknown',
    'dial tcp: no such host',
    'TLS certificate error',
    'HTTP status code: 503 manifest unknown',
    'timeout',
    'not found',
    'repository does not exist or may require authorization',
    'failed to read Docker configuration'
  ]) {
    assert.equal(isMissingManifest(message, reference), false, message)
  }
})

for (const inspectionError of ['unauthorized', 'network timeout', 'HTTP 500', 'unexpected registry error']) {
  test(`registry failure ${inspectionError} never triggers a manifest write`, () => {
    const mock = registry({ inspectionError })

    assert.throws(() => publication(mock), /Cannot safely inspect/)
    assert.ok(!mock.calls.some((args) => args[2] === 'create'))
  })
}

test('a matching existing release succeeds without artifacts or a write', () => {
  const mock = registry({ exists: true })

  const result = publishImage(release, {
    run: mock.run,
    loadDigests: () => {
      throw new Error('Artifacts must not be loaded')
    }
  })
  assert.deepEqual(result, { digest: manifest.digest, state: 'Already published' })
  assert.ok(!mock.calls.some((args) => args[2] === 'create'))
})

for (const [name, options] of [
  ['wrong commit', { configRevision: 'another-commit' }],
  ['wrong version', { configVersion: '9.9.9' }],
  ['wrong source', { configSource: 'https://github.com/another/repository' }],
  ['missing platform', { descriptor: { ...manifest, manifests: manifest.manifests.slice(0, 1) } }],
  ['duplicate platform', { descriptor: { ...manifest, manifests: [...manifest.manifests, manifest.manifests[0]] } }]
]) {
  test(`existing release with ${name} is rejected without writing`, () => {
    const mock = registry({ exists: true, ...options })

    assert.throws(() => publication(mock), /does not match|Expected Linux/)
    assert.ok(!mock.calls.some((args) => args[2] === 'create'))
  })
}

test('a non-Linux runtime manifest is rejected without writing', () => {
  const mock = registry({
    exists: true,
    descriptor: {
      ...manifest,
      manifests: [...manifest.manifests, { digest: digest('c'), platform: { os: 'windows', architecture: 'amd64' } }]
    }
  })

  assert.throws(() => publication(mock), /Unexpected non-Linux/)
  assert.ok(!mock.calls.some((args) => args[2] === 'create'))
})

test('publication creates both architecture references once and verifies its result', () => {
  const mock = registry()

  const result = publication(mock)

  assert.deepEqual(result, { digest: manifest.digest, state: 'Published image' })
  const writes = mock.calls.filter((args) => args[2] === 'create')
  assert.equal(writes.length, 1)
  for (const architecture of architectures) assert.ok(writes[0].includes(`${release.image}@${children[architecture]}`))
  assert.equal(mock.calls.filter((args) => args[4] === '--raw').length, 2)
})

test('publication rejects source images with the wrong commit before writing', () => {
  const mock = registry({ configRevision: 'another-commit' })

  assert.throws(() => publication(mock), /does not match/)
  assert.ok(!mock.calls.some((args) => args[2] === 'create'))
})

test('publication rejects a final digest different from the created manifest', () => {
  const mock = registry({ metadataDigest: digest('c') })

  assert.throws(() => publication(mock), /Published digest does not match/)
})

test('a retry recovers a manifest written before verification failed', () => {
  const mock = registry({ failAfterCreate: true })

  assert.throws(() => publication(mock), /Cannot safely inspect/)
  assert.deepEqual(publication(mock), { digest: manifest.digest, state: 'Already published' })
  assert.equal(mock.calls.filter((args) => args[2] === 'create').length, 1)
})

test('malformed registry responses cannot be mistaken for absent images', () => {
  assert.throws(() => inspectRelease(release, () => 'not JSON manifest unknown'), SyntaxError)
})

test('an existing tag with a missing child is rejected and never overwritten', () => {
  const mock = registry({ exists: true })

  const original = mock.run
  mock.run = (args) => {
    if (args[5] === '{{json .Image}}') throw new Error('failed fetching child: manifest unknown')
    return original(args)
  }
  assert.throws(() => publication(mock), /failed fetching child/)
  assert.ok(!mock.calls.some((args) => args[2] === 'create'))
})

test('existing manifest is fetched once and children are inspected by digest', () => {
  const mock = registry({ exists: true })

  const result = inspectRelease(release, mock.run)

  assert.equal(result, manifest.digest)
  assert.equal(mock.calls.filter((args) => args[4] === '--raw').length, 1)
  for (const architecture of architectures) {
    assert.ok(
      mock.calls.some(
        (args) => args[3] === `${release.image}@${children[architecture]}` && args[5] === '{{json .Image}}'
      )
    )
  }
})
