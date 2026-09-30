import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('no DSH version gate is declared at all', () => {
  // DSH turns an incompatible peer into a hard gate: install rejection, a whole
  // bundle skipped at startup, or a row disabled by the preflight. This plugin
  // therefore declares no @deepseek-ai peer - neither ceiling nor floor - and
  // relies on a loud, entry-isolated failure if the tool contract ever changes.
  const peers = manifest.peerDependencies ?? {}
  const dshPeers = Object.keys(peers).filter((name) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
  assert.deepEqual(dshPeers, [], 'DSH peers must stay empty so no update can gate this plugin off: ' + JSON.stringify(dshPeers))
  assert.equal(manifest.peerDependenciesMeta, undefined, 'no optional-peer bookkeeping is needed without peers')
})

test('the bundle patch is declared and present', () => {
  const patch = manifest.dsh.bundle.patch
  assert.equal(patch, './cordis.patch.yml')
  assert.ok(existsSync(join(root, patch)), 'the declared bundle patch file must exist')
  const text = readFileSync(join(root, patch), 'utf8')
  assert.match(text, /id: image-gen/)
  assert.match(text, /name: dsh-plugin-image-gen/)
})

test('the published file whitelist excludes tests and tooling', () => {
  for (const entry of manifest.files) {
    assert.ok(!entry.startsWith('tests'), 'tests must not ship: ' + entry)
    assert.ok(!entry.startsWith('tools'), 'tooling must not ship: ' + entry)
  }
  for (const required of ['lib', 'locale', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'LICENSE', 'COMPATIBILITY.md']) {
    assert.ok(manifest.files.includes(required), 'missing from files: ' + required)
  }
})

test('the host entry declares the documented cordis plugin shape', () => {
  const source = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  assert.match(source, /export const name/)
  assert.match(source, /export const inject = \['tools'\]/)
  assert.match(source, /export function apply\(ctx, entryConfig\)/)
  assert.ok(!/^import .*@deepseek-ai/m.test(source), 'the host entry must not import DSH packages')
})

test('locale metadata exists for both languages', () => {
  for (const lang of ['en', 'zh']) {
    const meta = JSON.parse(readFileSync(join(root, 'locale', lang + '.json'), 'utf8'))
    assert.ok(meta.meta.title.length > 0)
    assert.ok(meta.meta.description.length > 0)
  }
})
