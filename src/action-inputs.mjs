import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, relative } from 'node:path'
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
  if (platform !== 'linux') throw new Error('Run this action on a Linux runner.')
  const nativeArchitecture = { x64: 'amd64', arm64: 'arm64' }[architecture] || ''
  if (operation === 'build-image' && !architectures.includes(nativeArchitecture)) {
    throw new Error('build-image requires a native Linux amd64 or arm64 runner.')
  }
  return { image: `ghcr.io/${repository.toLowerCase()}`, architecture: nativeArchitecture }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { image, architecture } = validateInputs({
    operation: process.env.OPERATION,
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF
  })
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `image-name=${image}\narchitecture=${architecture}\nplatform=linux/${architecture}\n` +
      `package-json-file=${relative(process.env.GITHUB_WORKSPACE, join(process.env.ACTION_DIRECTORY, 'package.json'))}\n`
  )
}
