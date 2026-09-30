import { execSync } from 'node:child_process'

function setProxyEnv(url) {
  process.env.HTTPS_PROXY = url
  if (!process.env.HTTP_PROXY) process.env.HTTP_PROXY = url
}

/** Parse macOS "scutil --proxy" output into an http(s) proxy URL.
 *  Prefers the HTTPS entry; returns undefined when no web proxy is enabled. */
export function parseScutilProxy(text) {
  const get = (key) => {
    const m = text.match(new RegExp('^\\s*' + key + ' : (.+)$', 'm'))
    return m ? m[1].trim() : undefined
  }
  if (get('HTTPSEnable') === '1' && get('HTTPSProxy')) {
    return 'http://' + get('HTTPSProxy') + (get('HTTPSPort') ? ':' + get('HTTPSPort') : '')
  }
  if (get('HTTPEnable') === '1' && get('HTTPProxy')) {
    return 'http://' + get('HTTPProxy') + (get('HTTPPort') ? ':' + get('HTTPPort') : '')
  }
  return undefined
}

function windowsSystemProxy() {
  try {
    const key = '"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"'
    const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }
    const enabled = execSync('reg query ' + key + ' /v ProxyEnable', opts)
    const server = execSync('reg query ' + key + ' /v ProxyServer', opts)
    const m = server.match(/ProxyServer\s+REG_SZ\s+(\S+)/)
    if (/ProxyEnable\s+REG_DWORD\s+0x1/.test(enabled) && m) return 'http://' + m[1]
  } catch { /* no readable system proxy */ }
  return undefined
}

function macSystemProxy() {
  try {
    const out = execSync('scutil --proxy', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })
    return parseScutilProxy(out)
  } catch { /* scutil unavailable */ }
  return undefined
}

/**
 * Ensure HTTPS_PROXY is set in this process before the first request goes out
 * (Node's fetch builds its env-aware dispatcher lazily). Modes:
 *   "off"        - never touch proxying, direct connections only
 *   "auto"       - keep an existing HTTPS_PROXY, else detect the OS system proxy
 *   "<proxyURL>" - always use this proxy
 * Returns a short diagnostic label; never returns or logs credentials.
 * Note: OS proxies that require authentication are out of scope - set an
 * explicit proxy URL including credentials in the config file instead.
 */
export function ensureProxy(mode) {
  if (mode === 'off') return 'off'
  const explicit = mode !== 'auto' ? mode : (process.env.HTTPS_PROXY || process.env.https_proxy)
  if (explicit) {
    setProxyEnv(explicit)
    return mode === 'auto' ? 'environment' : 'configured'
  }
  if (process.platform === 'win32') {
    const url = windowsSystemProxy()
    if (url) {
      setProxyEnv(url)
      return 'windows-system'
    }
  } else if (process.platform === 'darwin') {
    const url = macSystemProxy()
    if (url) {
      setProxyEnv(url)
      return 'macos-system'
    }
  }
  return 'direct'
}
