#!/usr/bin/env node
import {
  copyFileSync,
  rmSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_ROOT = join(ROOT, 'node_modules/@shxdowcollective/voidware')
const PKG_CSS = join(PKG_ROOT, 'src/css')
const VENDOR_DIR = join(ROOT, 'web/vendor/voidware')
const IMPORT_RE = /@import\s+url\(["']([^"']+)["']\)/g
const EXPECTED_VOIDWARE_VERSION = '1.1.0'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function resolvePackageCssDir() {
  if (!existsSync(PKG_CSS)) {
    throw new Error(
      `Missing ${PKG_CSS}. Run npm ci to install @shxdowcollective/voidware before refreshing vendor CSS.`,
    )
  }
  return PKG_CSS
}

function copyCssFiles(sourceDir) {
  mkdirSync(VENDOR_DIR, { recursive: true })
  const copied = []
  for (const name of readdirSync(VENDOR_DIR)) {
    if (name.endsWith('.css')) rmSync(join(VENDOR_DIR, name))
  }
  for (const name of readdirSync(sourceDir).sort()) {
    if (!name.endsWith('.css')) continue
    copyFileSync(join(sourceDir, name), join(VENDOR_DIR, name))
    copied.push(name)
  }
  if (!copied.includes('index.css')) {
    throw new Error('Package CSS source did not include index.css')
  }
  return copied
}

function verifyImportChain() {
  const indexPath = join(VENDOR_DIR, 'index.css')
  const indexCss = readFileSync(indexPath, 'utf8')
  const imports = [...indexCss.matchAll(IMPORT_RE)].map((match) => match[1])
  if (!imports.length) {
    throw new Error('index.css did not declare any @import entries')
  }
  for (const relativePath of imports) {
    const target = join(VENDOR_DIR, relativePath)
    if (!existsSync(target)) {
      throw new Error(`index.css imports missing file: ${relativePath}`)
    }
  }
  return imports
}

function readLockProvenance() {
  const lockPath = join(ROOT, 'package-lock.json')
  if (!existsSync(lockPath)) return {}
  const lock = readJson(lockPath)
  const entry = lock.packages?.['node_modules/@shxdowcollective/voidware']
  if (!entry) return {}
  return {
    tarball: entry.resolved || '',
    integrity: entry.integrity || '',
  }
}

function writeVersionMarkdown({ version, copiedFiles, importChain }) {
  const { tarball, integrity } = readLockProvenance()
  const copiedDate = new Date().toISOString().slice(0, 10)
  const files = copiedFiles.filter((name) => name !== 'index.css').sort()
  const lines = [
    '# Vendored Voidware CSS',
    '',
    `- Package: \`@shxdowcollective/voidware\``,
    `- Version: \`${version}\``,
    `- Source path: \`node_modules/@shxdowcollective/voidware/src/css\``,
  ]
  if (tarball) lines.push(`- Source tarball: \`${tarball}\``)
  if (integrity) lines.push(`- Tarball integrity: \`${integrity}\``)
  lines.push(
    `- Refresh command: \`node scripts/vendor_voidware_css.mjs\``,
    `- Copied: \`${copiedDate}\``,
    `- License: \`Apache-2.0\`; vendored for the zero-build LLM-Dash static runtime.`,
    '',
    '## Files',
    '',
    '- `index.css`',
    ...files.map((name) => `- \`${name}\``),
    '',
    '## Import chain',
    '',
    ...importChain.map((name) => `- \`${name}\``),
    '',
  )
  writeFileSync(join(VENDOR_DIR, 'VERSION.md'), `${lines.join('\n')}`)
}

function main() {
  const sourceDir = resolvePackageCssDir()
  const pkg = readJson(join(PKG_ROOT, 'package.json'))
  const version = String(pkg.version || '')
  if (version !== EXPECTED_VOIDWARE_VERSION) {
    throw new Error(`Expected @shxdowcollective/voidware@${EXPECTED_VOIDWARE_VERSION}, found ${version || 'unknown version'}`)
  }

  const copiedFiles = copyCssFiles(sourceDir)
  const importChain = verifyImportChain()
  writeVersionMarkdown({ version, copiedFiles, importChain })

  console.log(
    JSON.stringify({
      ok: true,
      version,
      copied: copiedFiles.length,
      vendorDir: 'web/vendor/voidware',
      importChain,
    }),
  )
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
