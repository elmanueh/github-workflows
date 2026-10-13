import { inspectRelease } from './registry.mjs'
import { identity, output, summary } from '../action-outputs.mjs'

const release = identity()
const digest = inspectRelease(release)
output({ 'should-build': !digest, digest: digest || '' })
if (digest) summary('Already published', release, digest)
else console.log(`Ready to build and publish ${release.image}:${release.tag}`)
