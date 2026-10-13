import { appendFileSync } from 'node:fs'
import { architectures } from './platforms.mjs'

export function output(values) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  )
}

export function identity() {
  return {
    image: process.env.IMAGE_NAME,
    tag: process.env.RELEASE_TAG,
    revision: process.env.GITHUB_SHA,
    source: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
  }
}

export function summary(state, release, digest) {
  console.log(`${state}: ${release.image}:${release.tag}@${digest}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${state}\n\nRelease: [${release.tag}](${release.source}/releases/tag/${release.tag})\n\n` +
        `\`\`\`sh\ndocker pull ${release.image}:${release.tag}\n\`\`\`\n\nPlatforms: ${architectures.map((arch) => `linux/${arch}`).join(', ')}\n\nDigest: \`${digest}\`\n`
    )
  }
}
