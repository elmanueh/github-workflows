# Maintenance

The root `action.yml` exposes three stable operations: `create-release`, `build-image` and `publish-image`. The application coordinates them through a native runner matrix; release metadata and digest records are exchanged internally.

## Structure

- `src/release/`: isolated semantic-release configuration, GitHub release recovery and internal release context.
- `src/docker/`: metadata, registry checks, architecture records and manifest publication.
- `src/platforms.mjs`: supported architectures.
- `src/action-outputs.mjs` and `src/action-results.mjs`: shared action outputs and operation results.
- `test/`: versioning, recovery, publication, context and public contract tests.

Dependencies and their lockfile live at the root. No QEMU or builders outside GitHub are needed.

## Runtime contracts

Create-release uses standard checkout on `main` with full history. All checkouts must use the event commit without overriding `ref` or modifying the source; the action trusts checkout instead of rechecking HEAD. Semantic-release uses an owned configuration directory and explicit application Git paths, preventing caller dry-run or extension settings from affecting it. A successful new publication is accepted without querying GitHub again. A tag without its stable GitHub release is recoverable on a retry; failures do not trigger rollback.

The scripts are internal to the action. Each workflow run coordinates one release; artifact downloads use that same run. Release context contains only revision and tag, with no Docker state. Image name, version and release state are derived rather than stored. Architecture records contain revision, tag and digest; their artifact and file names identify the architecture. Build records must match the release tag and commit. The action detects architecture from the native Linux runtime, never from caller-supplied metadata.

Inputs are checked at the action entry point. Internal steps trust the action's outputs and execution conditions. Context and build records are checked when read; functions receiving those records do not repeat their validation. Internal artifact formats are not a public compatibility contract.

The `release-context` artifact always exists after successful create-release, including a no-release state. Architecture records are uploaded only for required builds. Artifacts are retained for one day and replaced on reruns within the same run. Records from a previous successful architecture attempt can be reused by a failed-job retry.

## Publication safety

Create-release does not set up Docker, log in to GHCR or inspect images. Each build checks for a matching published image before building. Publish downloads any available architecture artifacts by pattern; zero matches are allowed because an existing image needs no build records. If the image is absent, publication requires both records and fails when either is missing.

Root manifests are inspected with Buildx `--raw` and hashed without trimming bytes. Children are subsequently checked by immutable digest; missing children do not make the root tag appear absent.

Publish inspects the tag once before writing, validates build records and image version, source and commit labels, then verifies the resulting digest and both architectures. Matching published images succeed without reading build records or replacing the tag. Each inspection reads the root manifest once and trusts the registry's content-addressing contract.

Serialize all writers with `release-actions-<repository>` and do not cancel an active publication. GHCR has no compare-and-set tag write, so independent processes must not push these same release tags.

## Validation

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
```

Tests cover configuration isolation, release recovery, native operation inputs, context binding, registry failures, broken manifests and idempotent publication. CI also validates workflows with actionlint.

The pnpm version is pinned in `package.json`. Use `pnpm format` to format the project. CI and the action install from `pnpm-lock.yaml` with a frozen lockfile; the action reads its own package manifest rather than the application's package manager settings.

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
