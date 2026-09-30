# Compatibility and verification boundaries

## Verification matrix

| Environment | Status |
|---|---|
| DSH Desktop 0.2.0-rc.2, Windows x64 | Unit-tested and registration-tested locally; install verification pending |
| DSH Desktop 0.2.0-rc.2, macOS (arm64/x64) | Pending first install; macOS system-proxy detection covered by unit tests |
| DSH CLI / headless | Expected to work (same contracts); not yet verified |

This is a personal plugin, not an official DeepSeek product. The matrix above
states exactly what has been exercised; nothing more is claimed.

## No version gate (deliberate)

This package declares **no <code>@deepseek-ai</code> peer dependency at all**.
DSH's compatibility check returns "no incompatibility" immediately when the field
is absent, so nothing about a DSH release can gate this plugin.

That is intentional, because DSH treats an incompatible peer as a hard gate with
three severe outcomes:

- install is rejected (<code>incompatible-version</code>);
- an already-installed bundle outside the range is **skipped entirely** at
  startup (<code>loadProfileDirectory</code> moves it into <code>skippedBundles</code>);
- individual rows are **disabled** by the preflight (<code>row.disabled = true</code>).

Any version bound - even a floor - is a guess about a runtime this plugin does
not import. The plugin instead fails loudly and locally:

- <code>apply</code> checks that <code>ctx.tools.register</code> exists and throws
  a readable error when it does not;
- the Loader isolates that failure to this entry (fiber failed), so DSH keeps
  running and every other plugin is unaffected;
- the failure is visible on the Plugins page, where the entry can be disabled,
  rolled back, or the whole bundle uninstalled.

### Minimum runtime, stated as documentation

Tested and developed against DSH Desktop **0.2.0-rc.2**. The plugin requires a
DSH that provides the tools service (<code>ctx.tools</code>) and the bundle
patch contract. Older or newer runtimes are neither gated nor claimed: try it,
and if the contract is missing the error says exactly that.

## Dependency surface (why updates should rarely break this plugin)

- The host entry imports **only Node.js builtins**. No DSH package is imported.
- The only DSH contract used is the documented one every official tool plugin
  uses: a cordis plugin module (<code>name</code> / <code>inject</code> /
  <code>apply(ctx, config)</code>) plus <code>ctx.tools.register(definition)</code>
  with a plain-JSON tool definition.
- If <code>ctx.tools</code> is ever missing, <code>apply</code> throws a readable
  error; the Loader isolates the failure to this entry (fiber failed) and DSH
  continues normally. The entry can be disabled from the Plugins page.
- User configuration (<code>image-gen.config.json</code>) and credentials live in
  the DSH home directory, outside the package. Installing, upgrading, or
  reinstalling the bundle never touches them.

## Install, update, and restart behavior

- A **fresh install** applies live: the plugin manager reconciles the profile
  patch against the running Loader, so the tools are available on the next turn
  without restarting DSH (the UI reports <code>application: applied</code>).
- **Re-installing or upgrading an already-installed dependency** is reported as
  <code>restart-required</code> by the plugin manager (that is DSH's rule, not
  this plugin's): quit and reopen DSH after an upgrade.
- If the deployment runs without the HMR service, every plugin change is
  restart-required.

## Known limitations

- macOS/Windows system proxies that require authentication are not picked up
  from OS settings; set an explicit <code>proxy</code> URL (which may include
  credentials) in the config file instead.
- Generated images are saved to disk and reported as paths. Inline image
  results are deliberately not produced; models that can view images use the
  built-in <code>read_image</code> tool on the returned path.
