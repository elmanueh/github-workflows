# Pipeline maintenance

The reusable workflow coordinates three composite actions: `prepare-release`, `build-image` and `publish-image`. Their definitions live in `.github/actions/`, while release code and configuration live in `src/release/`. Tests live in `test/`, and `package.json` and `package-lock.json` live at the project root. Applications keep their own Dockerfile and CI checks.

The `prepare-release` action resolves this project's root from `github.action_path`, installs its locked dependencies there and runs `src/release/release.mjs`. The working directory remains the calling application's checkout so semantic-release analyzes and publishes that application's commits.

To run the versioning tests locally:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

## Initial publication

The `@v1` reference must exist before an application can use the workflow. Push this repository's changes and wait for its CI to pass. Then create the tags at that same validated commit:

```sh
git tag v1.0.0
git tag v1
git push origin v1.0.0 v1
```

## Updates

Keep exact version tags, such as `v1.0.0`, immutable. For a compatible improvement, validate the new commit, create a new exact version tag and move `v1` to that commit. Applications using `@v1` receive the update without changing their workflows.

For incompatible changes, publish a new major version and its compatibility reference, such as `v2`. Update the internal action references as well: the `v1` workflow uses this repository's actions through `@v1`.

## Validation

CI installs dependencies from the lockfile, tests versioning rules and validates workflows with actionlint. Also check the actions' input and output contracts. Before publishing a pipeline version, verify a real run from a test application repository; that run creates a GitHub release and an image in GHCR.
