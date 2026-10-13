import { inspectRelease } from './registry.mjs'
import { identity, output, summary } from './outputs.mjs'

const release = identity()
const digest = inspectRelease(release)
output({ digest: digest || '' })
if (digest) summary('Already published', release, digest)
else console.log(`Ready to build and publish ${release.image}:${release.tag}`)
