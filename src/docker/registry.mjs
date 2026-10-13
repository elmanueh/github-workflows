import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { architectures } from '../platforms.mjs'

export function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Docker exited with ${result.status}`)
  return result.stdout
}

export function isMissingManifest(message, reference) {
  // Only explicit missing-manifest responses count as absence. Authentication,
  // transport and server errors must stop the operation, never authorize a push.
  if (
    /unauthorized|denied|forbidden|timeout|timed out|tls|certificate|dial tcp|no such host|(?:status(?: code)?|HTTP)[^\n]*\b(?:401|403|429|5\d\d)\b/i.test(
      message
    )
  ) {
    return false
  }
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  return (
    /\bmanifest[_ ]unknown\b|\bno such manifest\b/i.test(message) ||
    new RegExp(`^(?:ERROR: )?${escaped}: not found$`, 'm').test(message)
  )
}

export function assertDigest(digest) {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest || '')) throw new Error('Invalid image digest.')
  return digest
}

export function verifyArchitecture(reference, architecture, { tag, revision, source }, run = docker) {
  const config = JSON.parse(run(['buildx', 'imagetools', 'inspect', reference, '--format', '{{json .Image}}']))
  const labels = config.config?.Labels || {}
  if (
    config.os !== 'linux' ||
    config.architecture !== architecture ||
    labels['org.opencontainers.image.version'] !== tag.slice(1) ||
    labels['org.opencontainers.image.revision'] !== revision ||
    labels['org.opencontainers.image.source'] !== source
  ) {
    throw new Error(
      `Existing ${architecture} image does not match this release and commit; it will not be overwritten.`
    )
  }
}

export function verifyImage(manifest, { image, tag, revision, source }, run = docker) {
  const digest = assertDigest(manifest.digest)
  const runtime = (manifest.manifests || []).filter((item) => item.platform?.os === 'linux')
  const actual = runtime.map((item) => item.platform.architecture).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...architectures].sort((a, b) => a.localeCompare(b)))) {
    throw new Error(`Expected Linux ${architectures.join(', ')}; got ${actual.join(', ') || 'no platforms'}.`)
  }
  // Unknown-platform attestation manifests are allowed; other runtime OSes are not.
  for (const item of manifest.manifests) {
    if (item.platform?.os !== 'linux' && item.annotations?.['vnd.docker.reference.type'] !== 'attestation-manifest') {
      throw new Error('Unexpected non-Linux manifest in the release image.')
    }
  }
  for (const item of runtime) {
    assertDigest(item.digest)
    verifyArchitecture(`${image}@${item.digest}`, item.platform.architecture, { tag, revision, source }, run)
  }
  return digest
}

export function inspectRelease(identity, run = docker) {
  const reference = `${identity.image}:${identity.tag}`
  let raw
  try {
    raw = run(['buildx', 'imagetools', 'inspect', reference, '--raw'])
  } catch (error) {
    if (isMissingManifest(error.message, reference)) return null
    throw new Error(`Cannot safely inspect ${reference}: ${error.message}`)
  }
  JSON.parse(raw)
  // Raw inspection only reads the root manifest. A missing child cannot be
  // mistaken for an absent tag. Hash the exact bytes, then inspect by digest.
  const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const digest = hash(raw)
  const pinned = run(['buildx', 'imagetools', 'inspect', `${identity.image}@${digest}`, '--raw'])
  if (hash(pinned) !== digest) throw new Error('Registry returned a mismatched manifest digest.')
  return verifyImage({ ...JSON.parse(pinned), digest }, identity, run)
}
