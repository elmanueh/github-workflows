import { appendFileSync } from 'node:fs'

const tag = process.env.RELEASE_TAG
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || '')) throw new Error('Invalid release tag.')
const labels = [
  `org.opencontainers.image.source=${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`,
  `org.opencontainers.image.revision=${process.env.GITHUB_SHA}`,
  `org.opencontainers.image.version=${tag.slice(1)}`
].join('\n')
appendFileSync(process.env.GITHUB_OUTPUT, `labels<<RELEASE_LABELS\n${labels}\nRELEASE_LABELS\n`)
