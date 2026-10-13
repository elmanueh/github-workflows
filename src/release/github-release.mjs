export async function githubApi(path, { method = 'GET', body } = {}, request = fetch) {
  const response = await request(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
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
  if (!response.ok && !(method === 'GET' && response.status === 404))
    throw new Error(`GitHub release request failed: HTTP ${response.status}.`)
  const data = await response.json()
  return { status: response.status, data }
}

export async function ensureGithubRelease({ repository, tag, revision, notes }, api = githubApi) {
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
  if (response.data.draft || response.data.prerelease) {
    throw new Error('Expected a published stable GitHub release for this tag.')
  }
}
