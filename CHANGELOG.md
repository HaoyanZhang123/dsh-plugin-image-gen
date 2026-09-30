# Changelog

## 0.1.2

Documentation-only release: the user-facing setup path is now complete enough
for someone who has never seen this plugin.

- **Fixed a misleading install spec**: the README still pointed at
  <code>#v0.1.0</code>, the broken release. Install instructions now lead with the
  tagless GitHub spec and a pinned <code>#v0.1.2</code> alternative.
- **Added the missing setup context**: where the DSH home actually is on Windows
  and macOS, the three places an API key can live, a Windows JSON backslash
  warning, and a verification step.
- **Added a Troubleshooting table**: missing key, invalid JSON, HTTP 401/404/429,
  non-OpenAI response shape, timeouts, and proxy problems.
- Chinese README rewritten to match, so both languages carry the same steps.

## 0.1.1

Fixes a schema bug that prevented the plugin from activating at all.

- **Tool definitions now use the JSON Schema subset DSH actually accepts.**
  0.1.0 copied the <code>defineTool</code> input spec style
  (<code>{ type: 'string', required: true }</code> per property), but
  <code>ctx.tools.register()</code> takes a finished JSON Schema where an object
  declares <code>required: ['name']</code> and where
  <code>minimum</code>/<code>maximum</code> are not supported at all. The entry
  failed with <code>JsonSchemaError: schema.properties.message.required is not
  supported on type "string"</code>. Requiredness moved to object level and the
  <code>n</code> range now lives in its description.
- **Regression coverage**: new <code>tests/schema.test.mjs</code> enforces the
  supported keyword subset, the per-type keyword restrictions, and
  object-level requiredness locally, rejects the exact 0.1.0 shape, and
  additionally validates the definitions with the real DSH validator when a
  runtime is resolvable.

## 0.1.0

Initial release.

- <code>generate_image</code>: text-to-image through any user-configured
  OpenAI-compatible endpoint, saving to disk with absolute paths in the result.
- <code>get_image_gen_config</code>: read-only view of the effective
  configuration and setup diagnostics; never exposes secret values.
- User configuration via <code>&lt;DSH home&gt;/image-gen.config.json</code>
  (hot-reloaded per call) with package defaults that carry no vendor lock-in.
- Credentials resolve through the official DSH layering (environment &gt;
  .credentials.yaml refs &gt; .env files); comma-separated names rotate keys.
- Pass-through <code>size</code>/<code>quality</code> and a
  <code>defaultParams</code> escape hatch keep provider-specific request shapes
  working without plugin changes.
- Proxy modes: auto (environment, else Windows registry / macOS scutil system
  proxy), off, or an explicit URL.
- Zero runtime dependencies and zero DSH-package imports in the host entry.
