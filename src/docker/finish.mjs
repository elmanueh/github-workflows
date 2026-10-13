import { assertDigest } from './registry.mjs'
import { output } from './outputs.mjs'

const digest = process.env.IMAGE_DIGEST || ''
if (digest) assertDigest(digest)
output({ published: process.env.OPERATION === 'publish-image' && Boolean(digest), digest })
if (!process.env.RELEASE_TAG && process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs')
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    '### No release needed\n\nNo releasable changes at this commit. Docker publication was skipped.\n'
  )
}
