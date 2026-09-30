# dsh-plugin-image-gen

Generate images from inside DeepSeek Harness (DSH) through **any OpenAI-compatible image endpoint you configure**. The package ships no endpoint, no model list tied to a vendor, and **no credentials** — you bring all three.

It registers two agent tools:

| Tool | Purpose |
|---|---|
| <code>generate_image</code> | Generate image(s) from a prompt and save them to disk; returns absolute path(s). |
| <code>get_image_gen_config</code> | Show the effective configuration and setup diagnostics (never secret values). |


## Install

In DSH's **Plugins** page, install by any of:

- npm package name: <code>dsh-plugin-image-gen</code>
- a GitHub spec: <code>github:HaoyanZhang123/dsh-plugin-image-gen#v0.1.0</code>
- the absolute local path of a packed <code>.tgz</code> or of this folder

A fresh install takes effect immediately - the next turn already has both
tools; no restart is needed. Upgrading an already-installed version is the
exception: DSH then asks for a restart.

## Quick start

**1. Add your API key** (pick one):

- In <code><DSH home>/.credentials.yaml</code>, under <code>refs:</code>, add for example:
  ~~~yaml
  refs:
    IMAGE_GEN_API_KEY: your-api-key-here
  ~~~
- Or export <code>IMAGE_GEN_API_KEY</code> in the environment that launches DSH.
- Or add <code>IMAGE_GEN_API_KEY=your-api-key-here</code> to <code><DSH home>/.env</code>.

Resolution mirrors the official DSH layering: process environment > <code>.credentials.yaml</code> refs > <code><cwd>/.env</code> > <code><DSH home>/.env</code>. Keys are **never** read from conversation, shown in tool output, or stored by this plugin.

**2. Point the plugin at your endpoint** — create <code><DSH home>/image-gen.config.json</code>:

~~~json
{
  "baseURL": "https://your-relay.example.com/v1",
  "apiKeyEnv": "IMAGE_GEN_API_KEY",
  "models": ["gpt-image-1", "another-model"],
  "defaultModel": "gpt-image-1"
}
~~~

Edits take effect on the next tool call; no restart needed. Ask the agent to run <code>get_image_gen_config</code> to verify.

**3. Generate**: "画一只在代码里游泳的猫" — or with overrides: "用 another-model 画一张 16:9 的横幅，出 4 张".

## Configuration reference

| Field | Default | Meaning |
|---|---|---|
| <code>baseURL</code> | <code>https://api.openai.com/v1</code> | Any OpenAI-compatible base URL; POST <code>/images/generations</code> is called. |
| <code>apiKeyEnv</code> | <code>IMAGE_GEN_API_KEY</code> | Credential name(s), comma-separated for rotation (e.g. <code>KEY_A,KEY_B</code>). Stores names, never keys. |
| <code>models</code> | <code>["gpt-image-1"]</code> | Model ids offered in tool documentation; the agent may pass any id. |
| <code>defaultModel</code> | first of <code>models</code> | Used when a call does not specify <code>model</code>. |
| <code>defaultParams</code> | <code>{}</code> | Extra request fields merged into every call — the escape hatch for provider-specific parameters (aspect_ratio, style, ...). |
| <code>timeoutMs</code> | <code>240000</code> | Per-request timeout. |
| <code>outputDir</code> | <code><DSH home>/image-gen/output</code> | Where images are saved; per-call <code>output_dir</code> overrides. |
| <code>proxy</code> | <code>auto</code> | <code>auto</code> (keep env proxy, else OS system proxy: Windows registry / macOS scutil), <code>off</code>, or an explicit <code>http://host:port</code> URL. |

Layering: package defaults < the entry's optional <code>config:</code> block in <code>cordis.patch.yml</code> < <code>image-gen.config.json</code>.

<code>size</code> and <code>quality</code> are **pass-through strings**: they are sent only when you set them (per call or via <code>defaultParams</code>); otherwise the endpoint applies its own defaults. Vocabulary differs per provider — the plugin never validates them, and endpoint errors are returned verbatim so the agent can retry.

## Security

- The published package contains no endpoints beyond the neutral OpenAI default, and no credentials; <code>files</code> in package.json whitelists exactly what ships.
- <code>pnpm run pack:check</code> packs the tarball and scans it for key-shaped strings before any release.
- API keys resolve from your own credential stores only and never appear in logs, tool output, or errors.

## Compatibility and failure behavior

See [COMPATIBILITY.md](COMPATIBILITY.md). In short: the plugin imports only Node builtins and the documented tool-registration contract; a load failure is isolated to its own entry and never blocks DSH. No DSH version gate is declared at all: the plugin never blocks an install, is never skipped after an update, and requires nothing of DSH except the documented tool contract. Tested against DSH Desktop 0.2.0-rc.2.

## Uninstall

Remove the bundle in the Plugins page. Your <code>image-gen.config.json</code>, saved images, and credentials are left untouched.
