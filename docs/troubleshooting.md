# Troubleshooting

| What happened                                    | What to check                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| GitHub cannot resolve `@v1`                      | The central repository must publish `v1` before applications can use it.                                                   |
| The operation is rejected                        | Use exactly `create-release`, `build-image` or `publish-image`.                                                            |
| The branch is rejected                           | Run every operation from `main`.                                                                                           |
| Build architecture is unsupported                | Use the example's native runner matrix. No architecture input or emulation is needed.                                      |
| Release context is missing                       | Run `create-release` first in the same workflow run. Rerun all jobs if artifacts expired.                                  |
| Context or build record does not match           | All operations must use the same repository, source commit and workflow run.                                               |
| No image is built                                | There are no releasable changes, or an existing image was verified. Subsequent jobs still start and skip their heavy work. |
| GitHub or GHCR access is denied                  | Check job permissions, repository Actions policy and package access for this repository.                                   |
| Docker cannot find files                         | Check `context`, `dockerfile` and `.dockerignore`.                                                                         |
| One architecture fails                           | Check platform support in Docker base images and native dependencies. The other build can still complete.                  |
| An existing image is rejected                    | Its platforms, version or source commit differ. It is not overwritten; release the correction as a new version.            |
| The tag exists but the GitHub release is missing | Retry at the same commit. The action completes the missing stable release.                                                 |
| Publication failed after builds                  | Retry failed jobs while artifacts exist, or rerun all jobs at the same commit.                                             |

Registry failures stop publication instead of being interpreted as missing images. A missing child of an existing root manifest also fails verification without authorizing an overwrite.

Application semantic-release configuration is isolated from the central process. You do not need to remove or customize it for this pipeline.
