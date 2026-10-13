# Troubleshooting

| Problem                                           | What to do                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub cannot find `elmanueh/release-actions@v1`  | Check that the action reference exists and your repository has access to it.                                                                                |
| The operation is rejected                         | Use `create-release`, `build-image` or `publish-image`.                                                                                                     |
| The branch or runner is rejected                  | Select `main` when starting the workflow and use a Linux runner.                                                                                            |
| No release is created                             | Check the commits since the last release. `fix:` and `feat:` create versions; `docs:` and `chore:` do not.                                                  |
| The tag exists but the GitHub release is missing  | Rerun the release workflow at the same commit to complete it.                                                                                               |
| GitHub or GHCR returns an access error            | Check the job permissions in [configuration](configuration.md). For Docker, also check that the repository can write to its GHCR package.                   |
| No Docker image is built                          | Use [release-with-docker.yml](../examples/release-with-docker.yml). Builds are skipped when there is no release or the matching image is already published. |
| Docker cannot find the Dockerfile or source files | Check `dockerfile`, `context` and `.dockerignore`.                                                                                                          |
| An architecture build fails                       | Keep both runners from the Docker example and check that your base images and build dependencies support amd64 and arm64. Then retry the failed jobs.       |
| Publication fails after the builds                | Retry the failed jobs at the same commit. If more than 24 hours have passed, rerun all jobs.                                                                |
| An existing image is rejected                     | Its version, source commit or platforms do not match. Publish the correction as a new version.                                                              |
| A private image cannot be pulled                  | Sign in with `docker login ghcr.io` using credentials with access to the package.                                                                           |

Keep the examples' job dependencies and concurrency settings. All operations must belong to the same workflow run.
