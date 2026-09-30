/**
 * pack:check - dry-run npm pack, verify the file whitelist, scan every shipped
 * file for credential-shaped or deployment-specific strings, then produce the
 * real tarball. Exits non-zero on any violation so a leak cannot ship.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Strings that must never appear in the published package. Extend freely. */
const FORBIDDEN = [
  { pattern: /sk-[A-Za-z0-9_-]{8,}/, label: 'API-key-shaped string (sk-...)' },
  { pattern: /META_API_KEY/, label: 'private credential name META_API_KEY' },
  { pattern: /cn\.meta-api\.vip/, label: 'private relay domain' },
  { pattern: /127\.0\.0\.1:7897/, label: 'private proxy address' },
  { pattern: /KIMI_CODING|COMMAND_CODE_GOAT/, label: 'unrelated private credential name' },
]

/** Shipped paths must stay inside these locations (package.json "files"). */
const ALLOWED = /^(lib\/|locale\/|cordis\.patch\.yml$|README(\.zh)?\.md$|LICENSE$|COMPATIBILITY\.md$|CHANGELOG\.md$|package\.json$)/

const dry = JSON.parse(execSync('npm pack --dry-run --json', { cwd: root, encoding: 'utf8', shell: true }))
const files = dry[0].files.map(f => f.path)
console.log('pack contains ' + files.length + ' files:')
let failed = false
for (const file of files) {
  const allowed = ALLOWED.test(file)
  if (!allowed) failed = true
  console.log('  ' + (allowed ? 'OK   ' : 'DENY ') + file)
}
for (const file of files) {
  if (/node_modules/.test(file)) continue
  const content = readFileSync(join(root, file), 'utf8')
  for (const { pattern, label } of FORBIDDEN) {
    if (pattern.test(content)) {
      console.log('LEAK ' + file + ': ' + label)
      failed = true
    }
  }
}
if (failed) {
  console.error('pack:check FAILED - fix the violations above before publishing.')
  process.exit(1)
}
const out = execSync('npm pack', { cwd: root, encoding: 'utf8', shell: true }).trim()
console.log('pack:check passed. Tarball: ' + out)
