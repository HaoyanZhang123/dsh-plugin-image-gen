import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let home
let savedHome

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'imagegen-config-'))
  savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
  rmSync(home, { recursive: true, force: true })
})

async function load() {
  return await import('../lib/config.js?ts=' + Date.now() + Math.random())
}

test('defaults apply when no config file exists', async () => {
  const { effectiveConfig } = await load()
  const { config, problems, configFileFound } = effectiveConfig(undefined)
  assert.equal(config.baseURL, 'https://api.openai.com/v1')
  assert.deepEqual(config.models, ['gpt-image-1'])
  assert.equal(config.defaultModel, 'gpt-image-1')
  assert.equal(config.timeoutMs, 240000)
  assert.equal(config.proxy, 'auto')
  assert.ok(config.outputDir.endsWith(join('image-gen', 'output')))
  assert.equal(configFileFound, false)
  assert.deepEqual(problems, [])
})

test('config file overrides defaults and strips trailing slash', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({
    baseURL: 'https://relay.example.com/v1/',
    apiKeyEnv: 'MY_KEY,MY_KEY_2',
    models: ['model-a', 'model-b'],
    defaultModel: 'model-b',
    defaultParams: { aspect_ratio: '16:9' },
  }))
  const { effectiveConfig } = await load()
  const { config, problems, configFileFound } = effectiveConfig(undefined)
  assert.equal(config.baseURL, 'https://relay.example.com/v1')
  assert.equal(config.apiKeyEnv, 'MY_KEY,MY_KEY_2')
  assert.deepEqual(config.models, ['model-a', 'model-b'])
  assert.equal(config.defaultModel, 'model-b')
  assert.deepEqual(config.defaultParams, { aspect_ratio: '16:9' })
  assert.equal(configFileFound, true)
  assert.deepEqual(problems, [])
})

test('invalid JSON is tolerated and reported', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), '{ not json')
  const { effectiveConfig } = await load()
  const { config, problems } = effectiveConfig(undefined)
  assert.equal(config.baseURL, 'https://api.openai.com/v1')
  assert.equal(problems.length, 1)
  assert.match(problems[0], /invalid JSON/)
})

test('invalid fields are skipped with problems, valid ones kept', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({
    baseURL: 'ftp://nope',
    models: [],
    timeoutMs: -5,
    proxy: 'socks5://x',
    defaultModel: 'ghost',
    outputDir: '/tmp/out',
  }))
  const { effectiveConfig } = await load()
  const { config, problems } = effectiveConfig(undefined)
  assert.equal(config.baseURL, 'https://api.openai.com/v1')
  assert.deepEqual(config.models, ['gpt-image-1'])
  assert.equal(config.timeoutMs, 240000)
  assert.equal(config.proxy, 'auto')
  assert.equal(config.defaultModel, 'gpt-image-1')
  assert.equal(config.outputDir, '/tmp/out')
  assert.ok(problems.length >= 4)
})

test('entry config sits between defaults and the file', async () => {
  writeFileSync(join(home, 'image-gen.config.json'), JSON.stringify({ baseURL: 'https://file.example.com/v1' }))
  const { effectiveConfig } = await load()
  const { config } = effectiveConfig({ baseURL: 'https://entry.example.com/v1', timeoutMs: 60000 })
  assert.equal(config.baseURL, 'https://file.example.com/v1')
  assert.equal(config.timeoutMs, 60000)
})
