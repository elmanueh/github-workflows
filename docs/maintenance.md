# Maintenance

The root `action.yml` exposes three stable operations: `create-release`, `build-image` and `publish-image`. The application coordinates them through a native runner matrix; release metadata and digest records are exchanged internally.

## Structure

- `src/release/`: isolated semantic-release configuration, GitHub release recovery and internal release context.
- `src/docker/`: metadata, registry checks, architecture records and manifest publication.
- `src/platforms.mjs`: supported architectures.
- `test/`: versioning, recovery, publication, context and public contract tests.

Dependencies and their lockfile live at the root. No QEMU or builders outside GitHub are needed.

## Runtime contracts

Create-release requires a full source checkout on `main` matching the workflow SHA. Semantic-release uses an owned configuration directory and explicit application Git paths, preventing caller dry-run or extension settings from affecting it. A tag without its stable GitHub release is recoverable.

Release context and architecture records have a schema version and must match the repository, commit and workflow run. Build checkout must also match that commit. The action detects architecture from the native Linux runtime, never from caller-supplied metadata.

The `release-context` artifact always exists after successful create-release, including a no-release state. Architecture records are uploaded only for required builds. Artifacts are retained for one day and replaced on reruns within the same run. Records from a previous successful architecture attempt can be reused by a failed-job retry.

## Publication safety

Root manifests are inspected with Buildx `--raw` and hashed without trimming bytes. Children are subsequently checked by immutable digest; missing children do not make the root tag appear absent.

Publish validates build records and image version, source and commit labels. It rechecks the tag immediately before writing, then verifies its resulting digest and both architectures. Matching published images succeed without replacement.

Serialize all writers with `release-actions-<repository>` and do not cancel an active publication. GHCR has no compare-and-set tag write, so independent processes must not push these same release tags.

## Validation

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

Tests cover configuration isolation, release recovery, native operation inputs, context binding, registry failures, broken manifests and idempotent publication. CI also validates workflows with actionlint.

Before updating `v1`, test a real application run with both native runners, no-release skipping, build/publication retries and an already published release. Local tests simulate API and registry responses.

## Version references

After source CI succeeds, publish the initial tested refs:

```sh
git tag v1.0.0
git tag v1
git push origin v1.0.0 v1
```

Preserve the root entry point, operation names, inputs and output meanings throughout `v1`. Keep exact tags immutable. Compatible updates move `v1`; breaking changes use a new major reference while retaining `v1`.

The reusable workflow remains an alternative entry point with its Docker path inputs. Previous one-call and three-operation prototypes were not published; the public contract is finalized with the first release.
