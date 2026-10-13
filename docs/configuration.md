# Configuration

Only two inputs are available. Both are optional strings. Add them to the calling job's `with` block, as shown in the [custom Docker example](../examples/release-custom.yml).

| Input        | Default      | Purpose                                          |
| ------------ | ------------ | ------------------------------------------------ |
| `context`    | `.`          | Docker build context.                            |
| `dockerfile` | `Dockerfile` | Dockerfile path relative to the repository root. |

## Fixed behavior

- Releases are created from `main` only.
- The image name is `ghcr.io/<owner>/<repository>`, using the calling repository in lowercase.
- Every image supports Linux `amd64` and `arm64`.
- Builds run in parallel on `ubuntu-24.04` and `ubuntu-24.04-arm`, respectively.
- Git and Docker tags use `v<version>`, calculated by semantic-release.
- The cache prefix is `docker`.

These settings cannot be overridden by the application. Its Dockerfile, base images and dependencies must support both architectures.

## Outputs

Use `needs.release.outputs.<name>` from a subsequent job if the calling job is named `release`.

| Output       | Value                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------- |
| `version`    | Semantic version, for example `1.2.3`.                                                       |
| `tag`        | Release and image tag, for example `v1.2.3`.                                                 |
| `image-name` | GHCR image name without a tag.                                                               |
| `digest`     | Verified digest of the published multi-platform image.                                       |
| `published`  | `true` when a release was created or recovered; `false` when there is no release to publish. |

`published` indicates that a release exists to process. To confirm Docker publication, check that the workflow succeeded and `digest` has a value.

## Caching

Docker caches build data to speed up subsequent builds. Each architecture has its own cache: `docker-release-amd64` and `docker-release-arm64`. Both can also read `docker-ci`. Caches belong to each application's repository.

Your application's Docker CI build can use:

```yaml
cache-from: |
  type=gha,scope=docker-ci
  type=gha,scope=docker-release-amd64
cache-to: type=gha,scope=docker-ci,mode=max
```

Digest artifacts are isolated by workflow run and retained for one day to support rerunning failed jobs.
