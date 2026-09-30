import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCredentialsRefs, parseEnvFile, resolveApiKeys } from '../lib/credentials.js'

let home
let savedHome
const touched = ['TIG_KEY_A', 'TIG_KEY_B']

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'imagegen-cred-'))
  savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  for (const k of touched) delete process.env[k]
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
  for (const k of touched) delete process.env[k]
  rmSync(home, { recursive: true, force: true })
})

test('parseCredentialsRefs reads only the flat refs section', () => {
  const text = [
    'version: 1',
    'records:',
    '  deepseek-account-platform/default:',
    '    kind: grant',
    '    payload:',
    '      token: should-not-be-captured',
    'refs:',
    '  TIG_KEY_A: value-a',
    '  TIG_KEY_B: value-b # inline comment kept simple',
    'other:',
    '  TIG_KEY_C: nope',
    '',
  ].join('\n')
  const refs = parseCredentialsRefs(text)
  assert.equal(refs.TIG_KEY_A, 'value-a')
  assert.equal(refs.TIG_KEY_B, 'value-b')
  assert.equal(refs.TIG_KEY_C, undefined)
  assert.equal(refs.token, undefined)
})

test('parseEnvFile handles quotes, export and comments', () => {
  const env = parseEnvFile([
    '# comment',
    'TIG_KEY_A=plain',
    'export TIG_KEY_B="quoted value"',
    '  ',
    'NOT_A_KEY LINE',
  ].join('\n'))
  assert.equal(env.TIG_KEY_A, 'plain')
  assert.equal(env.TIG_KEY_B, 'quoted value')
  assert.equal(Object.keys(env).length, 2)
})

test('environment wins over refs and .env', () => {
  writeFileSync(join(home, '.credentials.yaml'), 'version: 1\nrefs:\n  TIG_KEY_A: from-refs\n')
  writeFileSync(join(home, '.env'), 'TIG_KEY_A=from-dotenv\n')
  process.env.TIG_KEY_A = 'from-env'
  const { keys, sources } = resolveApiKeys(['TIG_KEY_A'])
  assert.deepEqual(keys, ['from-env'])
  assert.match(sources[0], /environment/)
})

test('refs beat .env and two names rotate', () => {
  writeFileSync(join(home, '.credentials.yaml'), 'version: 1\nrefs:\n  TIG_KEY_A: key-a\n')
  writeFileSync(join(home, '.env'), 'TIG_KEY_A=nope\nTIG_KEY_B=key-b\n')
  const { keys } = resolveApiKeys(['TIG_KEY_A', 'TIG_KEY_B'])
  assert.deepEqual(keys, ['key-a', 'key-b'])
})

test('missing names resolve to nothing', () => {
  const { keys } = resolveApiKeys(['TIG_KEY_A'])
  assert.deepEqual(keys, [])
})
