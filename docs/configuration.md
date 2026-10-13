# Configuration

Use `elmanueh/release-actions@v1` with one of the three operations. Copy the complete examples to preserve job dependencies and permissions.

## Inputs

| Input        | Default               | Purpose                                                        |
| ------------ | --------------------- | -------------------------------------------------------------- |
| `operation`  | Required              | `create-release`, `build-image` or `publish-image`.            |
| `context`    | `.`                   | Docker build context for `build-image`.                        |
| `dockerfile` | `Dockerfile`          | Dockerfile path relative to repository root for `build-image`. |
| `token`      | `${{ github.token }}` | GitHub token. Normally leave unset.                            |

There are no architecture, release tag, matrix, image name or cache-prefix inputs. The action detects the native architecture and retrieves release data internally.

## Workflow requirements

| Job     | Runner                                          | Permissions                         | Dependency                    |
| ------- | ----------------------------------------------- | ----------------------------------- | ----------------------------- |
| Release | `ubuntu-24.04`                                  | `contents: write`, `packages: read` | Application CI, when present. |
| Build   | Matrix of `ubuntu-24.04` and `ubuntu-24.04-arm` | `contents: read`, `packages: write` | Release.                      |
| Publish | `ubuntu-24.04`                                  | `packages: write`                   | Both builds.                  |

Check out complete history in the release job (`fetch-depth: 0`) and source code in the build job. Publish needs no checkout. All operations must run in the same workflow run from `main` at the same source commit.

Keep `release-actions-${{ github.repository }}` concurrency with `cancel-in-progress: false`. The examples use `fail-fast: false` for builds so a failed architecture does not cancel the other one.

## Internal data

`create-release` uploads an internal release context, including when there is nothing to publish. Later operations retrieve it automatically and validate the repository, commit and workflow run. Build records are also bound to the release and native architecture.

Applications do not need to define outputs or access these artifacts. If no release is needed or its image is already published, architecture builds are skipped internally. Publish verifies existing images again before reporting success.

Artifacts are retained for one day. Rerun all jobs at the same commit if context or digest artifacts expired. A partial rerun of failed jobs can reuse the other architecture's record within that period.

## Advanced outputs

Give the action step an `id` only if you need its outputs for another purpose.

| Output       | Value                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `version`    | Semantic release version when a release exists.                                                                 |
| `tag`        | Git and Docker release tag.                                                                                     |
| `image-name` | Repository-derived GHCR image name.                                                                             |
| `digest`     | Architecture digest after `build-image`; verified manifest digest after publication or an existing image check. |
| `published`  | `true` only when `publish-image` confirms a complete Docker release; otherwise `false`.                         |

These outputs are optional. The standard examples do not consume them.

## Cache reuse

Each native architecture keeps its own cache: `docker-release-amd64` or `docker-release-arm64`. Both can read `docker-ci`. Caches belong to the application repository.

An amd64 Docker CI build can use:

```yaml
cache-from: |
  type=gha,scope=docker-ci
  type=gha,scope=docker-release-amd64
cache-to: type=gha,scope=docker-ci,mode=max
```

## Alternative reusable workflow

`.github/workflows/release.yml` remains a wrapper that coordinates the same three operations. It accepts optional `context` and `dockerfile` inputs and exposes result outputs. Direct operation calls are the primary integration.
