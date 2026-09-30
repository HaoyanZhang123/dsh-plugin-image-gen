import { readFileSync } from 'node:fs'
import { configFilePath, defaultOutputDir } from './paths.js'

/** Package defaults. Neutral on purpose: the official OpenAI endpoint, its
 *  public flagship image model, and no provider-specific request fields. */
export const DEFAULTS = Object.freeze({
  baseURL: 'https://api.openai.com/v1',
  apiKeyEnv: 'IMAGE_GEN_API_KEY',
  models: Object.freeze(['gpt-image-1']),
  defaultModel: undefined,
  defaultParams: Object.freeze({}),
  timeoutMs: 240000,
  outputDir: '',
  proxy: 'auto',
})

const KEY_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Merge one configuration layer into target; invalid fields are skipped with
 *  a human-readable problem instead of throwing, so a bad edit never breaks
 *  the plugin or the host. */
function applyLayer(target, raw, source, problems) {
  if (raw === undefined || raw === null) return
  if (!isPlainObject(raw)) {
    problems.push(source + ': layer ignored (expected a JSON object)')
    return
  }
  if (raw.baseURL !== undefined) {
    if (typeof raw.baseURL === 'string' && /^https?:\/\/\S+$/.test(raw.baseURL.trim())) target.baseURL = raw.baseURL.trim().replace(/\/+$/, '')
    else problems.push(source + ': baseURL ignored (expected an http(s) URL string)')
  }
  if (raw.apiKeyEnv !== undefined) {
    const names = String(raw.apiKeyEnv).split(',').map(s => s.trim()).filter(s => s !== '')
    if (names.length > 0 && names.every(n => KEY_NAME.test(n))) target.apiKeyEnv = names.join(',')
    else problems.push(source + ': apiKeyEnv ignored (expected environment variable name(s), comma-separated)')
  }
  if (raw.models !== undefined) {
    if (Array.isArray(raw.models) && raw.models.length > 0 && raw.models.every(m => typeof m === 'string' && m.trim() !== '')) {
      target.models = raw.models.map(m => m.trim())
    } else problems.push(source + ': models ignored (expected a non-empty string array)')
  }
  if (raw.defaultModel !== undefined) {
    if (typeof raw.defaultModel === 'string' && raw.defaultModel.trim() !== '') target.defaultModel = raw.defaultModel.trim()
    else problems.push(source + ': defaultModel ignored (expected a string)')
  }
  if (raw.defaultParams !== undefined) {
    if (isPlainObject(raw.defaultParams)) target.defaultParams = { ...raw.defaultParams }
    else problems.push(source + ': defaultParams ignored (expected a JSON object of extra request fields)')
  }
  if (raw.timeoutMs !== undefined) {
    if (Number.isInteger(raw.timeoutMs) && raw.timeoutMs >= 1000) target.timeoutMs = raw.timeoutMs
    else problems.push(source + ': timeoutMs ignored (expected an integer >= 1000)')
  }
  if (raw.outputDir !== undefined) {
    if (typeof raw.outputDir === 'string') target.outputDir = raw.outputDir.trim()
    else problems.push(source + ': outputDir ignored (expected a string)')
  }
  if (raw.proxy !== undefined) {
    if (raw.proxy === 'auto' || raw.proxy === 'off' || (typeof raw.proxy === 'string' && /^https?:\/\/\S+$/.test(raw.proxy))) target.proxy = raw.proxy
    else problems.push(source + ': proxy ignored (expected "auto", "off", or an http(s) proxy URL)')
  }
}

export function readConfigFile(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { config: undefined, error: undefined }
    return { config: undefined, error: path + ': unreadable (' + error.message + '); file ignored' }
  }
  try {
    return { config: JSON.parse(text), error: undefined }
  } catch (error) {
    return { config: undefined, error: path + ': invalid JSON (' + error.message + '); file ignored, defaults apply' }
  }
}

/**
 * Effective configuration: package defaults < plugin entry config (the optional
 * "config:" block of the cordis entry) < the user config file. The file is
 * re-read on every call, so editing it takes effect without reloading DSH.
 */
export function effectiveConfig(entryConfig) {
  const problems = []
  const merged = {
    ...DEFAULTS,
    models: [...DEFAULTS.models],
    defaultParams: { ...DEFAULTS.defaultParams },
  }
  applyLayer(merged, entryConfig, 'plugin entry config', problems)
  const file = readConfigFile(configFilePath())
  if (file.error) problems.push(file.error)
  applyLayer(merged, file.config, configFilePath(), problems)
  if (merged.defaultModel === undefined || !merged.models.includes(merged.defaultModel)) {
    if (merged.defaultModel !== undefined) {
      problems.push('defaultModel "' + merged.defaultModel + '" is not listed in models; using "' + merged.models[0] + '"')
    }
    merged.defaultModel = merged.models[0]
  }
  if (merged.outputDir === '') merged.outputDir = defaultOutputDir()
  return { config: merged, problems, configFile: configFilePath(), configFileFound: file.config !== undefined }
}

export function apiKeyEnvNames(config) {
  return config.apiKeyEnv.split(',').map(s => s.trim()).filter(s => s !== '')
}
