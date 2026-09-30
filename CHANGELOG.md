# Changelog

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
