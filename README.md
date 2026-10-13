# release-actions

A GitHub Action that versions your application from its commits and publishes a Git tag and a GitHub release with notes. It can also build and publish a Docker image to GHCR for Linux amd64 and arm64.

Use it to automate version numbers, release notes and image publication across your repositories.

## Usage

1. Choose a workflow:
   - [Release only](examples/release-only.yml): Git tag and GitHub release.
   - [Release with Docker](examples/release-with-docker.yml): the same release plus a Docker image.
2. Copy it to `.github/workflows/release.yml` in your application.
3. Commit your changes to `main`, then run the workflow from **Actions → Run workflow**, selecting `main`.

Versions follow Conventional Commits:

| Commit                                  | Version change |
| --------------------------------------- | -------------- |
| `fix:`                                  | Patch          |
| `feat:`                                 | Minor          |
| `feat!:` or a `BREAKING CHANGE:` footer | Major          |
| `docs:` or `chore:`                     | No release     |

## Results

For version `1.2.3`, both workflows create tag `v1.2.3` and a GitHub release with notes. The Docker workflow also publishes:

```sh
docker pull ghcr.io/your-owner/your-repository:v1.2.3
```

The image supports both architectures under the same tag. If no new version is needed, publication is skipped. Existing matching releases and images are reused on retries.

See [configuration](docs/configuration.md) for inputs, permissions and requirements, or [troubleshooting](docs/troubleshooting.md) for common problems.
