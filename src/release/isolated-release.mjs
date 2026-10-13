import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import semanticRelease from 'semantic-release'
import config from './release-config.mjs'

export async function isolatedRelease({ gitDirectory, worktree, env, repositoryUrl, run = semanticRelease }) {
  const directory = mkdtempSync(join(tmpdir(), 'central-semantic-release-'))
  const configFile = join(directory, '.releaserc.json')
  // Stop config discovery in this owned directory. Git still operates on the
  // application through explicit paths, without loading its release config.
  writeFileSync(configFile, '{}')
  try {
    return await run(
      { ...config, branches: ['main'], repositoryUrl, extends: [], dryRun: false, ci: true, noCi: false },
      { cwd: directory, env: { ...env, GIT_DIR: gitDirectory, GIT_WORK_TREE: worktree } }
    )
  } finally {
    rmSync(configFile, { force: true })
    rmdirSync(directory)
  }
}
