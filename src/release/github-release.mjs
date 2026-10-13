export async function githubApi(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  })
  const data = await response.json()
  if (!response.ok && response.status !== 404)
    throw new Error(`GitHub release request failed: HTTP ${response.status}.`)
  return { status: response.status, data }
}

export async function ensureGithubRelease({ repository, tag, revision, tagRevision, notes }, api = githubApi) {
  if (tagRevision !== revision) throw new Error('Release tag does not point to the checked-out source commit.')
  const path = `/repos/${repository}/releases`
  let response = await api(`${path}/tags/${encodeURIComponent(tag)}`)
  if (response.status === 404) {
    response = await api(path, {
      method: 'POST',
      body: {
        tag_name: tag,
        target_commitish: revision,
        name: tag,
        body: await notes(),
        draft: false,
        prerelease: false
      }
    })
  }
  if (
    response.status < 200 ||
    response.status >= 300 ||
    response.data.tag_name !== tag ||
    response.data.draft ||
    response.data.prerelease
  ) {
    throw new Error('Expected a published stable GitHub release for this tag.')
  }
}
