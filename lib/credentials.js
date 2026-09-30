import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { credentialsFilePath, dshHome } from './paths.js'

/** Parse the flat "refs:" section of a DSH .credentials.yaml without pulling a
 *  YAML parser into the host. Tolerant by design: unknown lines are skipped. */
export function parseCredentialsRefs(text) {
  const refs = {}
  let inRefs = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inRefs = /^refs:\s*$/.test(line.trimEnd())
      continue
    }
    if (!inRefs) continue
    const m = line.match(/^\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(\S+)(?:\s+#.*)?\s*$/)
    if (m) refs[m[1]] = m[2]
  }
  return refs
}

/** Parse a dotenv-style file: KEY=VALUE lines, optional quotes, # comments. */
export function parseEnvFile(text) {
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let value = m[2]
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    env[m[1]] = value
  }
  return env
}

function readSafe(file) {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve API keys by environment-style names, mirroring the official DSH
 * credentials layering:
 *   inherited process environment (wins)
 *   > $DSH_HOME/.credentials.yaml  refs:
 *   > <cwd>/.env
 *   > $DSH_HOME/.env
 * Returns the resolved key values plus per-key source labels for diagnostics.
 * Key values are never logged or included in tool output by callers.
 */
export function resolveApiKeys(names) {
  const layers = [{ label: 'environment', values: process.env }]
  const refsText = readSafe(credentialsFilePath())
  if (refsText !== undefined) layers.push({ label: 'credentials refs', values: parseCredentialsRefs(refsText) })
  for (const file of [join(process.cwd(), '.env'), join(dshHome(), '.env')]) {
    const text = readSafe(file)
    if (text !== undefined) layers.push({ label: file, values: parseEnvFile(text) })
  }
  const keys = []
  const sources = []
  for (const name of names) {
    for (const layer of layers) {
      const value = layer.values[name]
      if (typeof value === 'string' && value.trim() !== '') {
        const key = value.trim()
        if (!keys.includes(key)) {
          keys.push(key)
          sources.push(name + ' (from ' + layer.label + ')')
        }
        break
      }
    }
  }
  return { keys, sources }
}
