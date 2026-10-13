import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

const read = (file) => parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))

test('root action exposes named operations with automatic native architecture detection', () => {
  const action = read('action.yml')
  const steps = action.runs.steps
  const builds = steps.filter((step) => step.uses === 'docker/build-push-action@v7')

  assert.equal(action.runs.using, 'composite')
  assert.deepEqual(Object.keys(action.inputs).sort(), ['context', 'dockerfile', 'operation', 'token'])
  assert.equal(action.inputs.operation.required, true)
  assert.equal(action.inputs.token.default, '${{ github.token }}')

  for (const name of ['version', 'tag', 'image-name', 'digest', 'published']) assert.ok(action.outputs[name])

  assert.ok(!steps.some((step) => step.uses?.includes('setup-qemu')))

  assert.equal(builds.length, 1)
  assert.equal(builds[0].with.platforms, '${{ steps.validate.outputs.platform }}')
  assert.match(builds[0].if, /build-image/)
  assert.match(builds[0].if, /should-build/)
  assert.ok(steps.some((step) => step.uses === 'actions/upload-artifact@v7' && step.with.name === 'release-context'))
  assert.ok(steps.some((step) => step.uses === 'actions/download-artifact@v8' && step.with.name === 'release-context'))
  assert.ok(
    steps.some((step) => step.uses === 'actions/download-artifact@v8' && step.with.pattern === 'image-digest-*')
  )
})

test('complete example uses a native runner matrix without passing version or state outputs', () => {
  const workflow = read('examples/release-with-docker.yml')
  const { release, build, publish } = workflow.jobs

  assert.equal(workflow.concurrency['cancel-in-progress'], false)

  assert.deepEqual(build.strategy.matrix.runner, ['ubuntu-24.04', 'ubuntu-24.04-arm'])
  assert.equal(build.strategy['fail-fast'], false)
  assert.equal(build['runs-on'], '${{ matrix.runner }}')
  assert.equal(build.needs, 'release')
  assert.equal(publish.needs, 'build')
  assert.ok(!release.outputs && !build.if)
  assert.equal(release.steps[0].with['fetch-depth'], 0)

  for (const [job, operation] of [
    [release, 'create-release'],
    [build, 'build-image'],
    [publish, 'publish-image']
  ]) {
    const step = job.steps.find((step) => step.uses === 'elmanueh/release-actions@v1')

    assert.equal(step.with.operation, operation)

    for (const key of Object.keys(step.with)) assert.ok(['operation', 'context', 'dockerfile', 'token'].includes(key))
  }
})

test('CI validates pushes and pull requests and can be reused without publishing', () => {
  const workflow = read('.github/workflows/ci.yml')

  assert.ok(Object.hasOwn(workflow.on, 'pull_request'))
  assert.ok(Object.hasOwn(workflow.on, 'workflow_call'))
  assert.deepEqual(workflow.on.push.branches, ['**'])
  assert.deepEqual(Object.keys(workflow.jobs), ['release-tools'])
  assert.deepEqual(workflow.permissions, { contents: 'read' })
})

test('client reusable release retains its inputs, outputs and Docker workflow', () => {
  const workflow = read('.github/workflows/release-application.yml')
  const contract = workflow.on.workflow_call

  assert.deepEqual(Object.keys(workflow.on), ['workflow_call'])
  for (const name of ['context', 'dockerfile']) assert.equal(contract.inputs[name].type, 'string')
  for (const name of ['version', 'tag', 'image-name', 'digest', 'published']) assert.ok(contract.outputs[name])
  assert.equal(workflow.jobs.release.steps[1].uses, 'elmanueh/release-actions@v1')
  assert.equal(workflow.jobs.release.steps[1].with.operation, 'create-release')
  assert.equal(workflow.jobs.build.needs, 'release')
  assert.deepEqual(workflow.jobs.build.strategy.matrix.runner, ['ubuntu-24.04', 'ubuntu-24.04-arm'])
  assert.equal(workflow.jobs.build.steps[1].with.context, '${{ inputs.context }}')
  assert.equal(workflow.jobs.build.steps[1].with.dockerfile, '${{ inputs.dockerfile }}')
  assert.equal(workflow.jobs.publish.needs, 'build')
  assert.equal(workflow.jobs.publish.steps[0].with.operation, 'publish-image')
})

test('Docker preflight belongs to builds and publication accepts an existing image without build records', () => {
  const steps = read('action.yml').runs.steps

  const check = steps.find((step) => step.id === 'check')
  const publish = steps.find((step) => step.id === 'publish')
  const download = steps.find((step) => step.with?.pattern === 'image-digest-*')

  assert.equal(
    check.if.trim(),
    "${{ inputs.operation == 'build-image' && steps.context.outputs.has-release == 'true' }}"
  )
  assert.equal(publish.if, "${{ inputs.operation == 'publish-image' && steps.context.outputs.has-release == 'true' }}")
  assert.equal(download.if, "${{ inputs.operation == 'publish-image' && steps.context.outputs.has-release == 'true' }}")
})

test('create-release never runs Docker commands or Docker actions', () => {
  const steps = read('action.yml').runs.steps
  const dockerSteps = steps.filter((step) => step.uses?.startsWith('docker/') || step.run?.includes('/src/docker/'))
  const releasePermissions = read('examples/release-with-docker.yml').jobs.release.permissions

  for (const step of dockerSteps) {
    assert.ok(step.if, step.name)
    assert.ok(!step.if.includes("operation == 'create-release'"), step.name)
    assert.ok(
      step.if.includes("operation != 'create-release'") ||
        step.if.includes("operation == 'build-image'") ||
        step.if.includes("operation == 'publish-image'"),
      step.name
    )
  }
  assert.deepEqual(releasePermissions, { contents: 'write' })
})

test('release-only example requires neither Docker jobs nor package permissions', () => {
  const workflow = read('examples/release-only.yml')
  const job = workflow.jobs.release

  assert.deepEqual(Object.keys(workflow.jobs), ['release'])
  assert.deepEqual(job.permissions, { contents: 'write' })
  assert.equal(job.steps[0].with['fetch-depth'], 0)
  assert.equal(job.steps[1].with.operation, 'create-release')
})

test('action publication waits for validation and runs only on manual main dispatches', () => {
  const workflow = read('.github/workflows/release.yml')
  const publish = workflow.jobs.publish
  const release = publish.steps.find((step) => step.id === 'release')
  const alias = publish.steps.find((step) => step.env?.RELEASE_TAG)

  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  assert.equal(workflow.jobs.ci.uses, './.github/workflows/ci.yml')
  assert.equal(workflow.jobs.ci.if, "${{ github.ref == 'refs/heads/main' }}")
  assert.equal(publish.needs, 'ci')
  assert.deepEqual(publish.permissions, { contents: 'write' })
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.equal(publish.steps[0].with['fetch-depth'], 0)
  assert.equal(release.uses, './')
  assert.equal(release.with.operation, 'create-release')
  assert.equal(alias.if, "${{ steps.release.outputs.tag != '' }}")
})
