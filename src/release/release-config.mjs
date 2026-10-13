import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const parserOpts = {
  headerPattern: /^(\w*)(?:\((.*)\))?(!)?: (.*)$/,
  headerCorrespondence: ['type', 'scope', 'breaking', 'subject']
}

export const analyzerOptions = {
  parserOpts,
  releaseRules: [{ header: '*!*:*', release: 'major' }]
}

export default {
  tagFormat: 'v${version}',
  plugins: [
    [require.resolve('@semantic-release/commit-analyzer'), analyzerOptions],
    [require.resolve('@semantic-release/release-notes-generator'), { parserOpts }],
    [require.resolve('@semantic-release/github'), { successComment: false, failComment: false, releasedLabels: false }]
  ]
}
