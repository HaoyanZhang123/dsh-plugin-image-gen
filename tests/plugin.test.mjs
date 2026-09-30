import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]).toString('base64')

function mockCtx() {
  const registered = new Map()
  return {
    registered,
    ctx: {
      tools: {
        register(definition) {
          registered.set(definition.name, definition)
          return () => registered.delete(definition.name)
        },
      },
      logger: () => ({ info() {}, warn() {} }),
    },
  }
}

let home
let savedHome
let savedFetch
const KEY_NAME = 'TIG_PLUGIN_KEY'
const KEY_VALUE = 'sk-testsecret-000000000000'

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'imagegen-plugin-'))
  savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  delete process.env[KEY_NAME]
  savedFetch = globalThis.fetch
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
  delete process.env[KEY_NAME]
  globalThis.fetch = savedFetch
  rmSync(home, { recursive: true, force: true })
})

async function freshPlugin() {
  return await import('../lib/index.js?ts=' + Date.now() + Math.random())
}

test('apply registers generate_image and get_image_gen_config', async () => {
  const { apply } = await freshPlugin()
  const { ctx, registered } = mockCtx()
  apply(ctx, undefined)
  assert.ok(registered.has('generate_image'))
  assert.ok(registered.has('get_image_gen_config'))
  const gen = registered.get('generate_image')
  assert.equal(gen.parameters.properties.prompt.required, true)
  assert.equal(typeof gen.output.render, 'function')
  assert.match(gen.description, /read_image/)
  assert.match(gen.description, /endpoint/)
})

test('apply fails loudly and readably without a tools service', async () => {
  const { apply } = await freshPlugin()
  assert.throws(() => apply({}, undefined), /tools service/)
})

test('generate_image without a key explains every storage option', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({ apiKeyEnv: KEY_NAME, proxy: 'off' }))
  const { apply } = await freshPlugin()
  const { ctx, registered } = mockCtx()
  apply(ctx, undefined)
  await assert.rejects(
    registered.get('generate_image').execute({ prompt: 'a cat' }, { signal: undefined }),
    (error) => {
      assert.match(error.message, new RegExp(KEY_NAME))
      assert.match(error.message, /refs:/)
      assert.match(error.message, /\.env/)
      assert.ok(!error.message.includes(KEY_VALUE))
      return true
    },
  )
})

test('generate_image end to end with a mocked endpoint', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({
    baseURL: 'https://api.test/v1',
    apiKeyEnv: KEY_NAME,
    models: ['model-a'],
    proxy: 'off',
  }))
  process.env[KEY_NAME] = KEY_VALUE
  let seenAuth
  globalThis.fetch = async (url, init) => {
    seenAuth = init.headers.Authorization
    return { ok: true, text: async () => JSON.stringify({ data: [{ b64_json: PNG_B64 }], usage: { total_tokens: 7 } }) }
  }
  const { apply } = await freshPlugin()
  const { ctx, registered } = mockCtx()
  apply(ctx, undefined)
  const value = await registered.get('generate_image').execute({ prompt: 'a small cat' }, { signal: undefined })
  assert.equal(seenAuth, 'Bearer ' + KEY_VALUE)
  assert.match(value.message, /Generated 1 image/)
  assert.match(value.message, /Usage: /)
  const pathMatch = value.message.match(/- (.+\.png) \(/)
  assert.ok(pathMatch, 'message lists the saved file')
  assert.ok(existsSync(pathMatch[1]))
  assert.ok(!value.message.includes(KEY_VALUE), 'key value never appears in output')
  const blocks = registered.get('generate_image').output.render({}, value)
  assert.equal(blocks[0].type, 'text')
})

test('upstream failure is wrapped with endpoint and model context', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({
    baseURL: 'https://api.test/v1', apiKeyEnv: KEY_NAME, proxy: 'off',
  }))
  process.env[KEY_NAME] = KEY_VALUE
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => 'bad size value' })
  const { apply } = await freshPlugin()
  const { ctx, registered } = mockCtx()
  apply(ctx, undefined)
  await assert.rejects(
    registered.get('generate_image').execute({ prompt: 'x', size: 'huge' }, { signal: undefined }),
    /endpoint https:\/\/api\.test\/v1, model gpt-image-1\): upstream HTTP 400: bad size value/,
  )
})

test('get_image_gen_config reports settings but never secret values', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({
    baseURL: 'https://relay.example.com/v1',
    apiKeyEnv: KEY_NAME,
    models: ['m1', 'm2'],
    defaultParams: { aspect_ratio: '16:9' },
  }))
  process.env[KEY_NAME] = KEY_VALUE
  const { apply } = await freshPlugin()
  const { ctx, registered } = mockCtx()
  apply(ctx, undefined)
  const value = await registered.get('get_image_gen_config').execute({}, { signal: undefined })
  assert.match(value.message, /https:\/\/relay\.example\.com\/v1/)
  assert.match(value.message, /m1, m2/)
  assert.match(value.message, /Resolved keys: 1/)
  assert.match(value.message, /aspect_ratio/)
  assert.ok(!value.message.includes(KEY_VALUE), 'key value never appears in the report')
  assert.ok(!value.message.includes('sk-testsecret'), 'no secret prefix leaks')
})

test('config file edits take effect on the next call without reload', async () => {
  process.env[KEY_NAME] = KEY_VALUE
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({ apiKeyEnv: KEY_NAME, proxy: 'off' }))
  const { apply } = await freshPlugin()
  const { ctx, registered } = mockCtx()
  apply(ctx, undefined)
  let first = await registered.get('get_image_gen_config').execute({}, { signal: undefined })
  assert.match(first.message, /https:\/\/api\.openai\.com\/v1/)
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({ apiKeyEnv: KEY_NAME, proxy: 'off', baseURL: 'https://changed.example.com/v1' }))
  let second = await registered.get('get_image_gen_config').execute({}, { signal: undefined })
  assert.match(second.message, /https:\/\/changed\.example\.com\/v1/)
})
