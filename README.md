# github-workflows

A reusable GitHub Actions workflow that creates a new version of your application, its Git tag and GitHub release, and publishes a Docker image with the same version to GitHub Container Registry (GHCR).

For example, version `1.2.3` produces:

- The Git tag `v1.2.3`.
- A GitHub release with release notes.
- The image `ghcr.io/your-owner/your-repository:v1.2.3`, available for Linux `amd64` and `arm64`.

## How it works

1. Semantic-release analyzes commits since the previous release and calculates the next version.
2. It creates the Git tag and GitHub release in your repository.
3. The workflow builds a Docker image for each architecture in parallel on native runners.
4. It publishes a single Docker tag for both architectures and verifies the published digest and platforms.

Commit messages determine the version change:

| Example commit                                         | Version change           |
| ------------------------------------------------------ | ------------------------ |
| `fix: correct a bug`                                   | Patch: `1.2.3` → `1.2.4` |
| `feat: add a feature`                                  | Minor: `1.2.3` → `1.3.0` |
| `feat!: change the API` or a `BREAKING CHANGE:` footer | Major: `1.2.3` → `2.0.0` |
| `docs: update documentation`, `chore: ...`             | No new version           |

If no commits require a new version, publication is skipped. If Docker fails after the release is created, run the workflow again at the same commit to complete publication. An existing image release tag is never overwritten.

## How to use it

Your application needs a GitHub repository with a `main` branch and a `Dockerfile` that supports Linux `amd64` and `arm64`. Any language or package manager can be used; semantic-release is configured and installed from this project.

Create `.github/workflows/release.yml` in your application repository:

```yaml
name: release

on:
  workflow_dispatch:

jobs:
  release:
    uses: elmanueh/github-workflows/.github/workflows/release.yml@v1
    permissions:
      contents: write
      packages: write
```

On GitHub, open **Actions → release → Run workflow** and select the `main` branch. Repository settings must allow reusable workflows and release creation. The workflow uses GitHub's automatic `GITHUB_TOKEN`; no personal access token is needed.

By default, it uses the root `Dockerfile`. It always publishes to `ghcr.io/<owner>/<repository>` in lowercase, from `main`, for Linux `amd64` and `arm64`. Only the Docker build context and Dockerfile path are configurable. After a successful run, you will find the release under **Releases**, the image under **Packages**, and its reference and digest in the workflow run summary.

Download the image with:

```sh
docker pull ghcr.io/your-owner/your-repository:v1.2.3
```

For private images, authenticate to GHCR first using an account with access to the package.

## Examples and configuration

- [Basic usage](examples/release.yml).
- [Run your application's CI before publishing](examples/release-with-ci.yml).
- [Customize the Docker build context and Dockerfile](examples/release-custom.yml).
- [Options, outputs and caching](docs/configuration.md).

The `@v1` reference receives compatible improvements without changes to each application's workflow. You can also pin a commit SHA to adopt updates explicitly.

This workflow publishes releases and images. It does not deploy containers to a server or update version fields in your application's files.

To maintain or publish the pipeline itself, see the [maintenance guide](docs/maintenance.md).
