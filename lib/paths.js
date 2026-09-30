import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * DSH home resolution without importing any DSH package (update resilience):
 * the DSH_HOME environment override wins, else ~/.dsh. Re-read on every call so
 * tests and long-running hosts always see the current value.
 */
export function dshHome() {
  const override = process.env.DSH_HOME
  if (typeof override === 'string' && override.trim() !== '') return override.trim()
  return join(homedir(), '.dsh')
}

export function configFilePath() {
  return join(dshHome(), 'image-gen.config.json')
}

export function credentialsFilePath() {
  return join(dshHome(), '.credentials.yaml')
}

export function defaultOutputDir() {
  return join(dshHome(), 'image-gen', 'output')
}
