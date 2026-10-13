# Configuration

Start from [release-only.yml](../examples/release-only.yml) or [release-with-docker.yml](../examples/release-with-docker.yml). Both run manually from `main`.

## Action versions

Use `elmanueh/release-actions@v1` to receive compatible updates. Pin an exact tag, such as `@v1.0.0`, or a full commit SHA to keep a fixed version. Breaking updates use a new major reference, such as `@v2`; applications on `@v1` keep their existing major version.

This repository publishes action versions after successful CI on `main`. Each publication creates an exact version tag and a GitHub release, then updates its major tag. Major tags have no separate GitHub release.

## Inputs

| Input        | Default               | Description                                                                        |
| ------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `operation`  | Required              | `create-release`, `build-image` or `publish-image`.                                |
| `token`      | `${{ github.token }}` | Token for GitHub and GHCR. Normally leave unset and use the job permissions below. |
| `context`    | `.`                   | Docker build context. Used by `build-image` only.                                  |
| `dockerfile` | `Dockerfile`          | Dockerfile path relative to the repository root. Used by `build-image` only.       |

`create-release` publishes the tag and GitHub release. For Docker, run `build-image` on both architectures after the release, then `publish-image` after both builds. The complete example already sets this order.

To use a different Dockerfile, change `dockerfile` in the build step. The image name is always `ghcr.io/<owner>/<repository>` in lowercase, and its tag matches the Git release tag.

## Requirements

- A `main` branch and Conventional Commit messages. Versioning is configured by this action; no semantic-release configuration is needed in your application.
- Linux runners. The Docker example uses `ubuntu-24.04` for amd64 and `ubuntu-24.04-arm` for arm64.
- Standard checkout of the workflow's commit. Keep `fetch-depth: 0` in the release job and do not override `ref`. Docker builds also need checkout; publication does not.
- Keep all operations in the same workflow run and preserve the examples' `needs` and `concurrency` settings.
- For Docker, a Dockerfile that supports both Linux architectures and permission to publish to the repository's GHCR package.

| Job                | Permissions                         |
| ------------------ | ----------------------------------- |
| Release            | `contents: write`                   |
| Docker build       | `contents: read`, `packages: write` |
| Docker publication | `packages: write`                   |

Release only needs no Dockerfile, Docker setup or package permissions. The examples use the automatic GitHub token; no personal access token is required.

## Outputs

Outputs are optional. Give the action step an `id` to use them as `${{ steps.<id>.outputs.<name> }}`.

| Output       | Description                                                                         |
| ------------ | ----------------------------------------------------------------------------------- |
| `version`    | Release version, such as `1.2.3`.                                                   |
| `tag`        | Release tag, such as `v1.2.3`.                                                      |
| `image-name` | Repository-derived GHCR image name.                                                 |
| `digest`     | Built image digest, or the verified published image digest. Empty for release only. |
| `published`  | `true` when `publish-image` confirms publication; otherwise `false`.                |

## Retries

Retry a failed workflow at the same commit. Completed releases and matching published images are reused. If more than 24 hours have passed, rerun all jobs. An incompatible existing image is rejected; publish the correction as a new version.
