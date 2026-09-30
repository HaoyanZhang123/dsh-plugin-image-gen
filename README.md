# dsh-plugin-image-gen

Generate images from inside DeepSeek Harness (DSH) through **any OpenAI-compatible image endpoint you configure**. The package ships no endpoint, no model list tied to a vendor, and **no credentials** - you bring all three.

It registers two agent tools:

| Tool | Purpose |
|---|---|
| <code>generate_image</code> | Generate image(s) from a prompt and save them to disk; returns absolute path(s). |
| <code>get_image_gen_config</code> | Show the effective configuration and setup diagnostics (never secret values). |

## What you need

- DSH (Desktop or CLI) with the tools service. Tested against DSH Desktop 0.2.0-rc.2.
- An image endpoint that speaks the OpenAI images API: <code>POST {baseURL}/images/generations</code>, returning <code>data[].b64_json</code> or <code>data[].url</code>. This covers OpenAI itself and most relays/gateways.
- An API key for that endpoint.

Nothing else: no system Node install, no dependencies, no build step.

## Install

In DSH's **Plugins** page:

- **Latest**: <code>github:HaoyanZhang123/dsh-plugin-image-gen</code>
- **Pinned**: <code>github:HaoyanZhang123/dsh-plugin-image-gen#v0.1.2</code>
- **Offline**: download the <code>.tgz</code> from [Releases](https://github.com/HaoyanZhang123/dsh-plugin-image-gen/releases) and paste its absolute path
- **npm** (if you prefer registry installs): <code>dsh-plugin-image-gen</code>

A fresh install takes effect immediately - the next turn already has both tools. **Upgrading** an already-installed version is the one case DSH reports as <code>restart-required</code>: quit and reopen DSH afterwards (closing the window is not quitting; use the tray icon).

## Set up

### 1. Find your DSH home

Everything lives there. Ask your agent to run <code>get_image_gen_config</code> - it prints the exact path in the "Config file" line. Or work it out:

| Platform | Default DSH home |
|---|---|
| Windows | <code>%USERPROFILE%\.dsh</code> (for example <code>C:\Users\you\.dsh</code>) |
| macOS / Linux | <code>~/.dsh</code> |
| Any, if set | whatever <code>DSH_HOME</code> points to |

### 2. Add your API key

Pick whichever suits you:

- In <code><DSH home>/.credentials.yaml</code>, under the existing <code>refs:</code> section:
  ~~~yaml
  refs:
    IMAGE_GEN_API_KEY: your-api-key-here
  ~~~
- Or export <code>IMAGE_GEN_API_KEY</code> in the environment that launches DSH.
- Or add <code>IMAGE_GEN_API_KEY=your-api-key-here</code> to <code><DSH home>/.env</code>.

Resolution mirrors the official DSH layering: process environment > <code>.credentials.yaml</code> refs > <code><working dir>/.env</code> > <code><DSH home>/.env</code>.

Keys are **never** read from conversation, shown in tool output, or stored by this plugin. Do not paste your key into a chat message - put it in one of the three places above.

### 3. Point it at your endpoint

Create <code><DSH home>/image-gen.config.json</code>:

~~~json
{
  "baseURL": "https://your-relay.example.com/v1",
  "apiKeyEnv": "IMAGE_GEN_API_KEY",
  "models": ["gpt-image-1", "another-model"],
  "defaultModel": "gpt-image-1"
}
~~~

That is the whole setup for most people. Skip this step entirely if you are using OpenAI itself with the default values - just add the key in step 2.

Two practical notes:

- <code>baseURL</code> is the part **before** <code>/images/generations</code>. If your gateway exposes images at <code>https://gw.example.com/openai/v1/images/generations</code>, set <code>baseURL</code> to <code>https://gw.example.com/openai/v1</code>.
- On Windows, write paths in JSON with doubled backslashes (<code>"E:\\images"</code>) or with forward slashes (<code>"E:/images"</code>).

Edits take effect on the next tool call - no restart.

### 4. Verify

Ask your agent to run <code>get_image_gen_config</code>. You want to see your endpoint, your models, and <code>Resolved keys: 1</code> (or more). Then say "generate an image of a red apple on a white table" and check the returned path on disk.

## Using it

Just describe the image. Overrides are per call and phrased naturally:

- "画一只在代码里游泳的猫" / "draw a cat swimming in code"
- "a 16:9 banner for a launch post" - the agent passes a matching <code>size</code>
- "four versions of the logo" - <code>n=4</code>
- "use another-model for this one" - a per-call model override

Images are saved as PNG files and reported by absolute path, so they survive independently of the conversation. To view one in chat, the active model must accept image input - otherwise open the file.

## Configuration reference

| Field | Default | Meaning |
|---|---|---|
| <code>baseURL</code> | <code>https://api.openai.com/v1</code> | Any OpenAI-compatible base URL; POST <code>/images/generations</code> is called. |
| <code>apiKeyEnv</code> | <code>IMAGE_GEN_API_KEY</code> | Credential name(s), comma-separated for rotation (for example <code>KEY_A,KEY_B</code>). Stores names, never keys. |
| <code>models</code> | <code>["gpt-image-1"]</code> | Model ids shown to the agent; it may pass any id. |
| <code>defaultModel</code> | first of <code>models</code> | Used when a call does not specify <code>model</code>. |
| <code>defaultParams</code> | <code>{}</code> | Extra request fields merged into every call - the escape hatch for provider-specific parameters such as <code>aspect_ratio</code> or <code>style</code>. |
| <code>timeoutMs</code> | <code>240000</code> | Per-request timeout. |
| <code>outputDir</code> | <code><DSH home>/image-gen/output</code> | Where images are saved; per-call <code>output_dir</code> overrides. |
| <code>proxy</code> | <code>auto</code> | <code>auto</code> (keep an environment proxy, else detect the OS system proxy: Windows registry / macOS scutil), <code>off</code>, or an explicit <code>http://host:port</code>. |

Layering: package defaults < the entry's optional <code>config:</code> block in the profile patch < <code>image-gen.config.json</code>.

<code>size</code> and <code>quality</code> are **pass-through strings**: they are sent only when you set them (per call or via <code>defaultParams</code>); otherwise the endpoint applies its own defaults. Vocabulary differs per provider - the plugin never validates them, and endpoint errors are returned verbatim so the agent can retry.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| <code>No API key found for "IMAGE_GEN_API_KEY"</code> | Step 2 was skipped, or the key sits under a name that differs from <code>apiKeyEnv</code>. Run <code>get_image_gen_config</code> to see which names are consulted. |
| <code>Configuration warnings: ... invalid JSON</code> | The config file failed to parse and was ignored; defaults apply. Validate the JSON and check for Windows backslashes. |
| <code>upstream HTTP 401</code> | The endpoint rejected the key (wrong key, wrong account, or a key for a different gateway). |
| <code>upstream HTTP 404</code> | <code>baseURL</code> is wrong - usually it already includes or omits <code>/v1</code>. The called URL is <code>{baseURL}/images/generations</code>. |
| <code>upstream HTTP 429</code> | Rate limited. Add a second key to <code>apiKeyEnv</code> (<code>KEY_A,KEY_B</code>); the plugin rotates on 401/429. |
| <code>upstream returned no image data</code> | The endpoint answered, but not in OpenAI image shape (<code>data[].b64_json</code> / <code>data[].url</code>). It is not compatible. |
| Request timed out | Raise <code>timeoutMs</code>. Large sizes and high quality can take minutes. |
| Connection errors behind a proxy | Leave <code>proxy: "auto"</code>, or set an explicit URL (including credentials if the proxy needs them). OS proxies requiring authentication are not picked up automatically. |

Anything else: the error text is returned verbatim from the endpoint, and <code>get_image_gen_config</code> reports the effective settings and config-file path.

## Security

- The published package contains no endpoint beyond the neutral OpenAI default and no credentials; the <code>files</code> whitelist in package.json defines exactly what ships.
- <code>npm run pack:check</code> packs the tarball and scans every shipped file for key-shaped strings before a release.
- API keys resolve only from your own credential stores and never appear in logs, tool output, or errors.

## Compatibility and failure behavior

See [COMPATIBILITY.md](COMPATIBILITY.md). In short: the plugin imports only Node builtins and the documented tool-registration contract, declares **no DSH version gate at all**, and fails loudly and locally if that contract ever changes. It is tested against DSH Desktop 0.2.0-rc.2 on Windows; macOS uses the same contracts (system-proxy detection covered by unit tests).

## Uninstall

Remove the bundle in the Plugins page. Your <code>image-gen.config.json</code>, saved images, and credentials are left untouched.

## For maintainers

~~~bash
node --test              # 37 tests
node tools/check-package.mjs   # file whitelist + credential-leak scan, then packs the tarball
~~~

Release flow: bump <code>version</code> in package.json, add a CHANGELOG entry, run both commands, commit, then <code>gh release create vX.Y.Z dsh-plugin-image-gen-X.Y.Z.tgz</code>.
