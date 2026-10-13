# release-actions

Three operations in one GitHub Action: create a semantic release, build native Docker images, and publish one verified multi-architecture image.

Every call uses the same reference:

```yaml
uses: elmanueh/release-actions@v1
with:
  operation: create-release
```

## Quick start

1. Your application needs a `main` branch and a Dockerfile that supports Linux `amd64` and `arm64`.
2. Copy [examples/release.yml](examples/release.yml) to `.github/workflows/release.yml`, or use [release-with-ci.yml](examples/release-with-ci.yml) to run your CI first.
3. Commit a release change such as `feat: add a feature`.
4. Open **Actions → release → Run workflow** in GitHub and select `main`.

The complete examples include permissions, concurrency and job dependencies. No personal access token or application-specific semantic-release configuration is needed.

## Operations

| Operation        | What it does                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `create-release` | Analyze commits, calculate the version, create or recover its Git tag and GitHub release. |
| `build-image`    | Detect the runner architecture and build its Docker image using the release version.      |
| `publish-image`  | Combine both images, publish the version tag and verify the resulting image.              |

Version, release state and digests are shared automatically through internal artifacts. You do not pass tags, architecture inputs or outputs between jobs.

Both native builds run in parallel using one job definition:

```yaml
build:
  needs: release
  strategy:
    fail-fast: false
    matrix:
      runner: [ubuntu-24.04, ubuntu-24.04-arm]
  runs-on: ${{ matrix.runner }}
  permissions:
    contents: read
    packages: write
  steps:
    - uses: actions/checkout@v7
    - uses: elmanueh/release-actions@v1
      with:
        operation: build-image
```

The full example also defines the `release` and `publish` jobs. `publish` uses `needs: build` to wait for both architectures. No emulation or auxiliary workflow is required.

## Results

For version `1.2.3`, you get Git tag `v1.2.3`, a GitHub release with notes, and one Docker tag supporting both Linux architectures:

```sh
docker pull ghcr.io/your-owner/your-repository:v1.2.3
```

The run summary includes the release link and verified image digest. Authenticate to GHCR before pulling a private image.

## Versioning and retries

| Commit                                                 | Version change |
| ------------------------------------------------------ | -------------- |
| `fix: correct a bug`                                   | Patch          |
| `feat: add a feature`                                  | Minor          |
| `feat!: change the API` or a `BREAKING CHANGE:` footer | Major          |
| `docs: ...`, `chore: ...`                              | None           |

When no release is needed, later operations finish without building or publishing. The jobs still start, but heavy work is skipped. Matching published images are verified and reported as **Already published**. Incompatible existing tags are rejected.

Retry at the same commit after a partial release or Docker failure. Internal artifacts are retained for one day; rerun all jobs if they have expired. The action does not deploy containers or change application version files.

## Examples and details

- [Complete workflow](examples/release.yml).
- [Run application CI first](examples/release-with-ci.yml).
- [Custom Dockerfile path](examples/release-custom.yml).
- [Configuration and advanced outputs](docs/configuration.md).
- [Troubleshooting](docs/troubleshooting.md).
- [Maintenance and compatibility](docs/maintenance.md).

The release branch, image name and supported architectures are fixed. `@v1` receives compatible updates; pin an exact version or commit SHA to control adoption.
