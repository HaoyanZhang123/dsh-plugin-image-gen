/**
 * dsh-plugin-image-gen - host entry.
 *
 * A zero-dependency DSH (cordis) plugin: it imports only node builtins and
 * registers two plain-definition tools on the shared tools service, the same
 * registration contract every official tool plugin uses. No DSH package is
 * imported, so a DSH update can only break the small, documented surface this
 * file touches - and a failure here is isolated to this entry's fiber.
 */
import { join } from 'node:path'
import { effectiveConfig, apiKeyEnvNames } from './config.js'
import { resolveApiKeys } from './credentials.js'
import { ensureProxy } from './proxy.js'
import { generateImages } from './provider.js'
import { configFilePath, credentialsFilePath, dshHome } from './paths.js'

export const name = 'image-gen'
export const inject = ['tools']

const GENERATE_DESCRIPTION = [
  'Generate image(s) from a text prompt with the configured OpenAI-compatible image endpoint and save them to disk.',
  'Returns the saved absolute file path(s); view a result with the read_image tool.',
  'Every option has a configured default (inspect with get_image_gen_config): model, size, quality, n, output_dir.',
  'Leave them unset unless the user asks otherwise.',
  'Honor per-request overrides phrased naturally: "a 16:9 banner" -> pass a matching size; "four versions" -> n=4; "in HD" -> a higher quality value.',
  'Valid size/quality vocabularies depend on the endpoint.',
  'Examples: OpenAI gpt-image sizes "1024x1024"/"1536x1024"/"1024x1536"/"auto" with quality "low"/"medium"/"high"/"auto"; other providers may accept "1K"/"2K"/"4K" or aspect ratios like "16:9".',
  'Pass the user value through as-is; if the endpoint rejects it, follow its error message.',
  'Endpoint, models, and credentials are user-configured; setup errors explain how to configure them.',
].join(' ')

const CONFIG_DESCRIPTION = [
  'Show the effective image-generation configuration: endpoint, models, request defaults, output directory, proxy mode,',
  'which credential names are configured and how many keys resolved (never the key values), plus setup diagnostics.',
  'Use this when the user asks how image generation is currently set up, or to debug a failing generate_image call.',
].join(' ')

// The tool definition carries a finished JSON Schema: the runtime accepts only
// the subset type/oneOf/properties/required/additionalProperties/items/enum/const
// plus the description/title/default/examples annotations. That means an
// object-level "required" array of declared property names - never the
// defineTool-style per-property "required" flag - and no minimum/maximum.
const GENERATE_PARAMETERS = {
  type: 'object',
  required: ['prompt'],
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', description: 'What to draw.' },
    model: { type: 'string', description: 'Image model id. Default: the configured default model.' },
    size: { type: 'string', description: 'Size/aspect value passed through to the endpoint (for example "1024x1024", "1536x1024", "1K", "16:9"). Default: the configured default, else the endpoint default.' },
    quality: { type: 'string', description: 'Quality value passed through to the endpoint (for example "low"/"medium"/"high"/"auto", or provider-specific values). Default: the configured default, else the endpoint default.' },
    n: { type: 'integer', description: 'How many images to generate, from 1 to 8. Default 1.' },
    output_dir: { type: 'string', description: 'Absolute directory to save into. Default: the configured output directory.' },
  },
}

const MESSAGE_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['message'],
  additionalProperties: false,
  properties: {
    message: { type: 'string' },
  },
}

function missingKeyMessage(names) {
  return 'No API key found for "' + names.join(', ') + '". Store it in the "refs:" section of '
    + credentialsFilePath() + ' (the DSH credentials file), export it in the environment that launches DSH, or add it to '
    + join(dshHome(), '.env') + '. Keys are never accepted from conversation. See the dsh-plugin-image-gen README for details.'
}

function formatSuccess(result, config, problems, proxyMode) {
  const lines = []
  lines.push('Generated ' + result.count + ' image(s) with ' + result.model + ' in ' + result.seconds + 's.')
  lines.push('Files:')
  for (const file of result.files) lines.push('- ' + file.path + ' (' + file.bytes + ' bytes)')
  lines.push('View them with the read_image tool.')
  lines.push('Endpoint: ' + config.baseURL
    + ' | Size: ' + (result.requestedSize !== undefined ? result.requestedSize : 'endpoint default')
    + ' | Quality: ' + (result.requestedQuality !== undefined ? result.requestedQuality : 'endpoint default')
    + ' | Proxy: ' + proxyMode)
  if (result.usage) lines.push('Usage: ' + JSON.stringify(result.usage))
  if (problems.length > 0) lines.push('Configuration warnings: ' + problems.join(' | '))
  return lines.join('\n')
}

function formatConfigReport(config, problems, extra) {
  const lines = []
  lines.push('Image generation - effective configuration')
  lines.push('Endpoint (baseURL): ' + config.baseURL)
  lines.push('Models: ' + config.models.join(', ') + ' (default: ' + config.defaultModel + ')')
  lines.push('Credential names (apiKeyEnv): ' + apiKeyEnvNames(config).join(', '))
  if (extra.keyCount > 0) {
    lines.push('Resolved keys: ' + extra.keyCount + ' - ' + extra.keySources.join(', ') + ' (values never shown)')
  } else {
    lines.push('Resolved keys: none - ' + missingKeyMessage(apiKeyEnvNames(config)))
  }
  lines.push('Default request params (defaultParams): ' + JSON.stringify(config.defaultParams))
  lines.push('Size/quality: sent only when passed per call or present in defaultParams; otherwise the endpoint applies its own defaults.')
  lines.push('Timeout: ' + config.timeoutMs + ' ms | Output dir: ' + config.outputDir + ' | Proxy: ' + config.proxy)
  lines.push('Config file: ' + extra.configFile + ' (' + (extra.configFileFound ? 'found' : 'not found - package defaults apply') + ')')
  if (problems.length > 0) lines.push('Warnings: ' + problems.join(' | '))
  lines.push('To change values, edit the config file (takes effect immediately) or ask the agent to edit it. Secrets belong only in your credentials store.')
  return lines.join('\n')
}

export function apply(ctx, entryConfig) {
  const tools = ctx && ctx.tools
  if (!tools || typeof tools.register !== 'function') {
    throw new Error('dsh-plugin-image-gen requires the DSH tools service (ctx.tools), which this DSH version does not provide. See COMPATIBILITY.md for supported versions.')
  }

  tools.register({
    name: 'generate_image',
    description: GENERATE_DESCRIPTION,
    parameters: GENERATE_PARAMETERS,
    output: {
      schema: MESSAGE_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    timeoutMs: 300000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
      if (prompt === '') throw new Error('generate_image: "prompt" is required and must be a non-empty string')
      const { config, problems } = effectiveConfig(entryConfig)
      const proxyMode = ensureProxy(config.proxy)
      const names = apiKeyEnvNames(config)
      const { keys } = resolveApiKeys(names)
      if (keys.length === 0) throw new Error(missingKeyMessage(names))
      try {
        const result = await generateImages({ config, keys, args: { ...args, prompt }, signal: exec?.signal })
        return { message: formatSuccess(result, config, problems, proxyMode) }
      } catch (error) {
        const reason = error && error.message ? error.message : String(error)
        throw new Error('generate_image failed (endpoint ' + config.baseURL + ', model '
          + (typeof args.model === 'string' && args.model.trim() !== '' ? args.model.trim() : config.defaultModel)
          + '): ' + reason)
      }
    },
  })

  tools.register({
    name: 'get_image_gen_config',
    description: CONFIG_DESCRIPTION,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: MESSAGE_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    isConcurrencySafe: () => true,
    async execute() {
      const { config, problems, configFile, configFileFound } = effectiveConfig(entryConfig)
      const { keys, sources } = resolveApiKeys(apiKeyEnvNames(config))
      return {
        message: formatConfigReport(config, problems, {
          keyCount: keys.length,
          keySources: sources,
          configFile,
          configFileFound,
        }),
      }
    },
  })

  try {
    ctx.logger('image-gen').info('registered tools: generate_image, get_image_gen_config (config file: ' + configFilePath() + ')')
  } catch { /* logging is best-effort */ }
}
