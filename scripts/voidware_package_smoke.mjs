#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_ROOT = join(ROOT, 'node_modules/@shxdowcollective/voidware')
const PKG_CSS = join(PKG_ROOT, 'src/css')
const VENDOR_DIR = join(ROOT, 'web/vendor/voidware')
const IMPORT_RE = /@import\s+url\(["']([^"']+)["']\)/g

const RUNTIME_EXPORTS = [
  '@shxdowcollective/voidware/auth',
  '@shxdowcollective/voidware/auth-templates',
  '@shxdowcollective/voidware/logging',
]

const REQUIRED_CSS = [
  'index.css',
  'variables.css',
  'base.css',
  'typography.css',
  'background.css',
  'animations.css',
  'buttons.css',
  'inputs.css',
  'cards.css',
  'toggles.css',
  'popovers.css',
  'modals.css',
  'toasts.css',
  'wizard.css',
  'avatars.css',
  'status-chips.css',
  'layout.css',
  'responsive.css',
]

function assertPackageInstalled() {
  if (!existsSync(PKG_ROOT)) {
    throw new Error('Missing node_modules/@shxdowcollective/voidware. Run npm ci first.')
  }
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
  if (pkg.version !== '1.0.1') {
    throw new Error(`Expected @shxdowcollective/voidware@1.0.1, found ${pkg.version}`)
  }
  return pkg.version
}

function checkCssSources() {
  const missing = REQUIRED_CSS.filter((name) => !existsSync(join(PKG_CSS, name)))
  if (missing.length) {
    throw new Error(`Package CSS source missing files: ${missing.join(', ')}`)
  }

  const indexCss = readFileSync(join(PKG_CSS, 'index.css'), 'utf8')
  const imports = [...indexCss.matchAll(IMPORT_RE)].map((match) => match[1])
  const brokenImports = imports.filter((name) => !existsSync(join(PKG_CSS, name)))
  if (brokenImports.length) {
    throw new Error(`Package index.css imports missing files: ${brokenImports.join(', ')}`)
  }

  const vendorFiles = readdirSync(VENDOR_DIR).filter((name) => name.endsWith('.css')).sort()
  return {
    packageCssCount: REQUIRED_CSS.length,
    vendorCssCount: vendorFiles.length,
    importChain: imports,
  }
}

async function checkRuntimeExports() {
  const loaded = {}
  for (const specifier of RUNTIME_EXPORTS) {
    const mod = await import(specifier)
    loaded[specifier] = Object.keys(mod).sort()
  }
  return loaded
}

async function main() {
  const version = assertPackageInstalled()
  const css = checkCssSources()
  const exports = await checkRuntimeExports()

  console.log(
    JSON.stringify({
      ok: true,
      version,
      css,
      exports,
    }),
  )
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
