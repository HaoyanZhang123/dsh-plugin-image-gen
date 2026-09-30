import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * DSH accepts only a JSON Schema subset for tool definitions. This module
 * enforces the same rules locally so a schema mistake fails here instead of
 * silently disabling the plugin inside a running DSH (which is exactly what
 * happened with per-property "required" flags in 0.1.0).
 */

const SUPPORTED_KEYWORDS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'description', 'title', 'default', 'examples',
])
const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']

function validateSchema(node, path, violations) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    violations.push(path + ' must be a schema object')
    return
  }
  for (const key of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) violations.push(path + '.' + key + ' is not a supported keyword')
  }
  const hasType = Object.hasOwn(node, 'type')
  const hasOneOf = Object.hasOwn(node, 'oneOf')
  if (hasType && hasOneOf) {
    violations.push(path + ' cannot declare both type and oneOf')
    return
  }
  if (!hasType && !hasOneOf) {
    violations.push(path + ' must declare type or oneOf')
    return
  }
  if (hasOneOf) {
    if (!Array.isArray(node.oneOf) || node.oneOf.length < 2) violations.push(path + '.oneOf must hold at least two schemas')
    else node.oneOf.forEach((child, i) => validateSchema(child, path + '.oneOf[' + i + ']', violations))
    return
  }
  if (!SCHEMA_TYPES.includes(node.type)) {
    violations.push(path + '.type must be one of ' + SCHEMA_TYPES.join('/'))
    return
  }
  // Keyword/type restrictions, mirroring the runtime exactly. Without this the
  // validator misses the 0.1.0 bug: "required" is a supported keyword, just not
  // on a string.
  const KEYWORD_TYPES = {
    properties: ['object'],
    required: ['object'],
    additionalProperties: ['object'],
    items: ['array'],
    enum: ['string', 'number', 'integer', 'boolean', 'null'],
    const: ['string', 'number', 'integer', 'boolean', 'null'],
  }
  for (const [key, types] of Object.entries(KEYWORD_TYPES)) {
    if (Object.hasOwn(node, key) && !types.includes(node.type)) {
      violations.push(path + '.' + key + ' is not supported on type "' + node.type + '"')
    }
  }
  if (node.type === 'object') {
    if (node.properties !== undefined) {
      if (typeof node.properties !== 'object' || node.properties === null || Array.isArray(node.properties)) {
        violations.push(path + '.properties must be an object')
      } else {
        for (const [name, child] of Object.entries(node.properties)) validateSchema(child, path + '.properties.' + name, violations)
      }
    }
    if (Object.hasOwn(node, 'required')) {
      if (!Array.isArray(node.required) || node.required.some(entry => typeof entry !== 'string')) {
        violations.push(path + '.required must be an array of strings (not per-property flags)')
      } else {
        const declared = node.properties ?? {}
        for (const name of node.required) {
          if (!Object.hasOwn(declared, name)) violations.push(path + '.required names "' + name + '" which is not in properties')
        }
      }
    }
    if (Object.hasOwn(node, 'additionalProperties') && typeof node.additionalProperties !== 'boolean') {
      violations.push(path + '.additionalProperties must be a boolean')
    }
  }
  if (node.type === 'array') {
    if (node.items === undefined) violations.push(path + '.items is required for an array')
    else validateSchema(node.items, path + '.items', violations)
  }
}

/** Register the real tool definitions against a stub tools service. */
async function collectDefinitions() {
  const home = mkdtempSync(join(tmpdir(), 'imagegen-schema-'))
  const savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const mod = await import('../lib/index.js?ts=' + Date.now() + Math.random())
    const definitions = []
    mod.apply({
      tools: { register: (definition) => { definitions.push(definition); return () => {} } },
      logger: () => ({ info() {}, warn() {} }),
    }, undefined)
    return definitions
  } finally {
    if (savedHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = savedHome
    rmSync(home, { recursive: true, force: true })
  }
}

test('every registered definition stays inside the supported schema subset', async () => {
  const definitions = await collectDefinitions()
  assert.equal(definitions.length, 2)
  for (const definition of definitions) {
    for (const [label, schema] of [['parameters', definition.parameters], ['output.schema', definition.output.schema]]) {
      const violations = []
      validateSchema(schema, label, violations)
      assert.deepEqual(violations, [], definition.name + ': ' + violations.join('; '))
    }
  }
})

test('requiredness uses object-level arrays on declared properties', async () => {
  const definitions = await collectDefinitions()
  const generate = definitions.find(d => d.name === 'generate_image')
  assert.deepEqual(generate.parameters.required, ['prompt'])
  assert.equal(generate.parameters.properties.prompt.required, undefined, 'per-property required flags are rejected by DSH')
  assert.deepEqual(generate.output.schema.required, ['message'])
})

test('unsupported keywords such as minimum are absent', async () => {
  const definitions = await collectDefinitions()
  const generate = definitions.find(d => d.name === 'generate_image')
  assert.equal(generate.parameters.properties.n.minimum, undefined)
  assert.equal(generate.parameters.properties.n.maximum, undefined)
  assert.equal(generate.parameters.additionalProperties, false)
})

test('the local subset rules reject the 0.1.0 mistake', () => {
  const violations = []
  validateSchema({ type: 'object', additionalProperties: false, properties: { message: { type: 'string', required: true } } }, 'schema', violations)
  assert.ok(violations.length > 0, 'a per-property required flag must be reported')
  assert.match(violations.join(' '), /not a supported keyword|required/)
})

/**
 * Machine-independent above; this one uses the real DSH runtime when it can be
 * found, so the plugin is validated against the actual validator, not a copy.
 */
const RUNTIME_CANDIDATES = [
  process.env.DSH_TOOLS_MODULE,
  'E:/DSH-desktop/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
].filter(Boolean)

test('the real DSH validator accepts the definitions when the runtime is present', async (t) => {
  let dshTools
  for (const candidate of RUNTIME_CANDIDATES) {
    try {
      dshTools = await import(pathToFileURL(candidate).href)
      break
    } catch { /* try the next candidate */ }
  }
  if (dshTools === undefined) {
    t.skip('no DSH runtime found on this machine')
    return
  }
  const definitions = await collectDefinitions()
  for (const definition of definitions) {
    dshTools.assertSupportedJsonSchema(definition.output.schema)
    dshTools.assertObjectJsonSchema(definition.parameters)
  }
})
