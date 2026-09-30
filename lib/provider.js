import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/** Turn a prompt into a filesystem-safe slug for generated filenames. */
export function slugify(text, maxLength = 48) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
  return slug || 'image'
}

export function timestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds())
}

function combinedSignal(signals) {
  const live = signals.filter(s => s !== undefined && s !== null)
  if (live.length === 0) return undefined
  if (live.length === 1) return live[0]
  return typeof AbortSignal.any === 'function' ? AbortSignal.any(live) : live[0]
}

/** Persist one base64 payload (or download one URL) and return the written path. */
async function saveImage(item, index, directory, baseName, timeoutMs, fetchImpl) {
  const suffix = index === 0 ? '' : '-' + (index + 1)
  const file = join(directory, baseName + suffix + '.png')
  if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    const bytes = Buffer.from(item.b64_json, 'base64')
    writeFileSync(file, bytes)
    return { path: file, bytes: bytes.length }
  }
  if (typeof item.url === 'string' && item.url.length > 0) {
    const response = await fetchImpl(item.url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) throw new Error('downloading generated image failed: HTTP ' + response.status)
    const bytes = Buffer.from(await response.arrayBuffer())
    writeFileSync(file, bytes)
    return { path: file, bytes: bytes.length }
  }
  throw new Error('upstream returned neither b64_json nor url')
}

/**
 * Call an OpenAI-compatible POST {baseURL}/images/generations endpoint.
 *
 * Request body layering (later wins):
 *   configured defaultParams  <  canonical fields (model/prompt/n)  <  per-call size/quality
 * Size and quality are only sent when explicitly set - when omitted, the
 * endpoint applies its own defaults, which keeps unknown providers working.
 *
 * Multiple API keys rotate: a connection failure or an HTTP 401/429 with one
 * key retries with the next; the last error wins when every key fails.
 */
export async function generateImages(options) {
  const { config, keys, args, signal, fetchImpl = fetch } = options
  const model = typeof args.model === 'string' && args.model.trim() !== '' ? args.model.trim() : config.defaultModel
  const n = Number.isInteger(args.n) ? Math.min(Math.max(args.n, 1), 8) : 1
  const body = { ...config.defaultParams, model, prompt: args.prompt, n }
  if (typeof args.size === 'string' && args.size.trim() !== '') body.size = args.size.trim()
  if (typeof args.quality === 'string' && args.quality.trim() !== '') body.quality = args.quality.trim()

  const directory = typeof args.output_dir === 'string' && args.output_dir.trim() !== ''
    ? (isAbsolute(args.output_dir) ? args.output_dir : resolve(args.output_dir))
    : config.outputDir
  mkdirSync(directory, { recursive: true })

  const callSignal = combinedSignal([AbortSignal.timeout(config.timeoutMs), signal])
  const started = Date.now()
  let raw
  let lastError
  for (const [index, apiKey] of keys.entries()) {
    try {
      const response = await fetchImpl(config.baseURL + '/images/generations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: callSignal,
      })
      const text = await response.text()
      if (!response.ok) {
        lastError = new Error('upstream HTTP ' + response.status + ': ' + text.slice(0, 600))
        if ((response.status === 401 || response.status === 429) && index < keys.length - 1) continue
        throw lastError
      }
      raw = text
      lastError = undefined
      break
    } catch (error) {
      lastError = error
      if (index < keys.length - 1) continue
    }
  }
  if (raw === undefined) throw lastError

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error('upstream returned non-JSON: ' + raw.slice(0, 300))
  }
  const items = Array.isArray(payload && payload.data) ? payload.data : []
  if (items.length === 0) throw new Error('upstream returned no image data: ' + raw.slice(0, 300))

  const baseName = timestamp() + '-' + slugify(args.prompt)
  const files = []
  for (const [index, item] of items.entries()) {
    files.push(await saveImage(item, index, directory, baseName, config.timeoutMs, fetchImpl))
  }

  return {
    model,
    requestedSize: body.size,
    requestedQuality: body.quality,
    count: files.length,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    directory,
    files,
    usage: payload && payload.usage !== undefined ? payload.usage : null,
  }
}
