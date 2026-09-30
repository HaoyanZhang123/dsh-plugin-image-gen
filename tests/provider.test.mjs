import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateImages, slugify, timestamp } from '../lib/provider.js'

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString('base64')

function baseConfig(dir) {
  return {
    baseURL: 'https://api.test/v1',
    defaultModel: 'model-a',
    defaultParams: {},
    timeoutMs: 5000,
    outputDir: dir,
  }
}

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'imagegen-provider-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

test('slugify and timestamp produce safe names', () => {
  assert.equal(slugify('A cat, 一只猫!'), 'a-cat-一只猫')
  assert.equal(slugify('!!!'), 'image')
  assert.match(timestamp(new Date(2026, 8, 30, 1, 2, 3)), /^20260930-010203$/)
})

test('request body layers defaults, canonical fields and call overrides', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, text: async () => JSON.stringify({ data: [{ b64_json: PNG_B64 }] }) }
  }
  const config = { ...baseConfig(dir), defaultParams: { size: '1K', extra_field: 'keep' } }
  await generateImages({
    config,
    keys: ['k1'],
    args: { prompt: 'a cat', size: '2K', quality: 'hd' },
    fetchImpl,
  })
  const body = JSON.parse(calls[0].init.body)
  assert.equal(calls[0].url, 'https://api.test/v1/images/generations')
  assert.equal(body.model, 'model-a')
  assert.equal(body.prompt, 'a cat')
  assert.equal(body.n, 1)
  assert.equal(body.size, '2K')
  assert.equal(body.quality, 'hd')
  assert.equal(body.extra_field, 'keep')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k1')
})

test('size and quality are omitted unless explicitly set', async () => {
  let seen
  const fetchImpl = async (url, init) => {
    seen = JSON.parse(init.body)
    return { ok: true, text: async () => JSON.stringify({ data: [{ b64_json: PNG_B64 }] }) }
  }
  await generateImages({ config: baseConfig(dir), keys: ['k1'], args: { prompt: 'x' }, fetchImpl })
  assert.equal('size' in seen, false)
  assert.equal('quality' in seen, false)
})

test('keys rotate on 401 and the second key succeeds', async () => {
  const auth = []
  const fetchImpl = async (url, init) => {
    auth.push(init.headers.Authorization)
    if (auth.length === 1) return { ok: false, status: 401, text: async () => 'unauthorized' }
    return { ok: true, text: async () => JSON.stringify({ data: [{ b64_json: PNG_B64 }] }) }
  }
  const result = await generateImages({ config: baseConfig(dir), keys: ['bad', 'good'], args: { prompt: 'x' }, fetchImpl })
  assert.deepEqual(auth, ['Bearer bad', 'Bearer good'])
  assert.equal(result.count, 1)
  assert.ok(existsSync(result.files[0].path))
  assert.deepEqual(readFileSync(result.files[0].path), Buffer.from(PNG_B64, 'base64'))
})

test('the last error wins when every key fails', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'boom' })
  await assert.rejects(
    generateImages({ config: baseConfig(dir), keys: ['a', 'b'], args: { prompt: 'x' }, fetchImpl }),
    /HTTP 500: boom/,
  )
})

test('url payloads are downloaded and saved', async () => {
  const png = Buffer.from(PNG_B64, 'base64')
  const fetchImpl = async (url) => {
    if (url.includes('images/generations')) {
      return { ok: true, text: async () => JSON.stringify({ data: [{ url: 'https://cdn.test/img.png' }] }) }
    }
    return { ok: true, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.length) }
  }
  const result = await generateImages({ config: baseConfig(dir), keys: ['k'], args: { prompt: 'x', n: 1 }, fetchImpl })
  assert.deepEqual(readFileSync(result.files[0].path), png)
})

test('per-call output_dir and n produce suffixed files', async () => {
  const custom = mkdtempSync(join(tmpdir(), 'imagegen-out-'))
  const fetchImpl = async () => ({
    ok: true,
    text: async () => JSON.stringify({ data: [{ b64_json: PNG_B64 }, { b64_json: PNG_B64 }] }),
  })
  const result = await generateImages({
    config: baseConfig(dir),
    keys: ['k'],
    args: { prompt: 'two cats', n: 2, output_dir: custom },
    fetchImpl,
  })
  assert.equal(result.count, 2)
  assert.ok(result.files[0].path.startsWith(custom))
  assert.match(result.files[1].path, /-2\.png$/)
  rmSync(custom, { recursive: true, force: true })
})
