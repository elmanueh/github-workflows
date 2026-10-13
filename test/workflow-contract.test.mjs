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

for (const file of ['examples/release.yml', 'examples/release-with-ci.yml', 'examples/release-custom.yml']) {
  test(`${file} uses a native runner matrix without passing version or state outputs`, () => {
    const workflow = read(file)
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
}

test('CI example waits for application checks before creating the release', () => {
  const workflow = read('examples/release-with-ci.yml')

  assert.equal(workflow.jobs.release.needs, 'ci')
})

test('optional reusable workflow retains Docker path inputs and result outputs', () => {
  const workflow = read('.github/workflows/release.yml')

  const contract = workflow.on.workflow_call

  for (const name of ['context', 'dockerfile']) assert.equal(contract.inputs[name].type, 'string')

  for (const name of ['version', 'tag', 'image-name', 'digest', 'published']) assert.ok(contract.outputs[name])
  assert.equal(workflow.jobs.build.steps[1].uses, 'elmanueh/release-actions@v1')
  assert.equal(workflow.jobs.build.steps[1].with.operation, 'build-image')
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
  const releasePermissions = read('examples/release.yml').jobs.release.permissions

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
