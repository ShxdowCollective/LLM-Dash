#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function resolveCliServiceModule() {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@shxdowcollective/voidware-cli/dist/service/index.js')
  } catch {
    return fileURLToPath(import.meta.resolve('@shxdowcollective/voidware-cli'))
  }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_ROOT = join(ROOT, 'node_modules/@shxdowcollective/voidware')
const PKG_CSS = join(PKG_ROOT, 'src/css')
const VENDOR_DIR = join(ROOT, 'web/vendor/voidware')
const IMPORT_RE = /@import\s+url\(["']([^"']+)["']\)/g
const EXPECTED_VOIDWARE_VERSION = '1.1.0'

const RUNTIME_EXPORTS = [
  '@shxdowcollective/voidware/auth',
  '@shxdowcollective/voidware/auth-templates',
  '@shxdowcollective/voidware/logging',
]

const CLI_BROKER_EXPORTS = [
  'createAppOwnedAuthBroker',
  'detectLocalAuthBroker',
  'createLocalAuthBrokerClient',
  'requestDurableVoidwareAuthGrant',
  'BrokerRequestError',
  'AuthService',
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
  'theme-template.css',
]

function assertPackageInstalled() {
  if (!existsSync(PKG_ROOT)) {
    throw new Error('Missing node_modules/@shxdowcollective/voidware. Run npm ci first.')
  }
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
  if (pkg.version !== EXPECTED_VOIDWARE_VERSION) {
    throw new Error(`Expected @shxdowcollective/voidware@${EXPECTED_VOIDWARE_VERSION}, found ${pkg.version}`)
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

async function checkCliService() {
  const cliRoot = join(ROOT, 'node_modules/@shxdowcollective/voidware-cli')
  const binPath = join(cliRoot, 'dist/bin.js')
  if (!existsSync(binPath)) {
    throw new Error('Missing node_modules/@shxdowcollective/voidware-cli/dist/bin.js. Run npm ci first.')
  }
  const cliPkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8'))
  if (cliPkg.version !== EXPECTED_VOIDWARE_VERSION) {
    throw new Error(`Expected @shxdowcollective/voidware-cli@${EXPECTED_VOIDWARE_VERSION}, found ${cliPkg.version}`)
  }
  let modulePath
  try {
    modulePath = resolveCliServiceModule()
  } catch {
    throw new Error('Could not resolve @shxdowcollective/voidware-cli service module from node_modules.')
  }
  const mod = await import(pathToFileURL(modulePath).href)
  const missing = CLI_BROKER_EXPORTS.filter((key) => !(key in mod))
  if (missing.length) {
    throw new Error(`Voidware CLI service module missing exports: ${missing.join(', ')}`)
  }
  return {
    binPath: 'node_modules/@shxdowcollective/voidware-cli/dist/bin.js',
    serviceModule: modulePath,
    exports: CLI_BROKER_EXPORTS,
  }
}

async function main() {
  const version = assertPackageInstalled()
  const css = checkCssSources()
  const exports = await checkRuntimeExports()
  const cli = await checkCliService()

  console.log(
    JSON.stringify({
      ok: true,
      version,
      css,
      exports,
      cli,
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
