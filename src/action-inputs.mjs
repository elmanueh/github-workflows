import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { architectures } from './platforms.mjs'

export function validateInputs({
  operation,
  repository,
  ref,
  platform = process.platform,
  architecture = process.arch
}) {
  if (!['create-release', 'build-image', 'publish-image'].includes(operation)) {
    throw new Error('operation must be create-release, build-image or publish-image.')
  }
  if (ref !== 'refs/heads/main') throw new Error('Run this release workflow from the main branch.')
  if (platform !== 'linux') throw new Error('Run this action on a Linux runner with Docker.')
  if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(repository || ''))
    throw new Error('Expected GITHUB_REPOSITORY to contain owner/repository.')
  if (operation === 'build-image' && !architectures.includes({ x64: 'amd64', arm64: 'arm64' }[architecture])) {
    throw new Error('build-image requires a native Linux amd64 or arm64 runner.')
  }
  return `ghcr.io/${repository.toLowerCase()}`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const image = validateInputs({
    operation: process.env.OPERATION,
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF
  })
  const architecture = { x64: 'amd64', arm64: 'arm64' }[process.arch] || ''
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `image-name=${image}\narchitecture=${architecture}\nplatform=linux/${architecture}\n`
  )
}
