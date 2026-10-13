import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

export function updateMajorTag(tag, run = git) {
  const major = tag.split('.')[0]
  const latest = run(['tag', '--list', `${major}.*.*`, '--sort=-version:refname'])
    .split('\n')
    .find((value) => /^v\d+\.\d+\.\d+$/.test(value))
  // An older workflow retry must not move consumers back to an older version.
  if (latest !== tag) {
    console.log(`Keep ${major}: ${latest} is the latest published version.`)
    return false
  }
  run(['tag', '--force', major, `refs/tags/${tag}^{commit}`])
  run(['push', '--force', 'origin', `refs/tags/${major}:refs/tags/${major}`])
  console.log(`${major} now points to ${tag}.`)
  return true
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateMajorTag(process.env.RELEASE_TAG)
}
