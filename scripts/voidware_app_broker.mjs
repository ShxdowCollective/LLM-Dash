#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const APP_NAME = 'llm-dash'
const MAX_GRANT_TTL = '120d'
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000
const GRANT_RE = /vwgr_[A-Za-z0-9._-]+/g

let service
let broker
let ownsBroker = false
let pendingApproval = null
let activeGrant = null

const MAX_CHAINED_APPROVALS = 5

function redact(value) {
  if (typeof value !== 'string') return value
  return value.replace(GRANT_RE, 'vwgr_***')
}

function redactedClone(value) {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (typeof item !== 'string') return item
    if (key === 'password') return '***'
    if (key === 'secret') return item
    if (item.startsWith('vwgr_')) return 'vwgr_***'
    if (/^(sk-|xai-|AIza|eyJ)/.test(item)) return '***'
    return redact(item)
  }))
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(redactedClone(payload))}\n`)
}

function errorPayload(err, fallback = 'bridge_error') {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : fallback
  const message = err instanceof Error ? err.message : String(err || 'Voidware bridge failed')
  return {
    ok: false,
    code,
    message: redact(message),
    details: err && typeof err === 'object' && 'details' in err ? redactedClone(err.details) : undefined,
  }
}

function context() {
  const ctx = {
    appName: APP_NAME,
    repoPath: ROOT,
  }
  if (process.env.LLM_DASH_SHXDOW_ROOT) ctx.shxdowDir = resolve(process.env.LLM_DASH_SHXDOW_ROOT)
  if (process.env.VOIDWARE_AUTH_OVERRIDE_PATH) ctx.authOverridePath = resolve(process.env.VOIDWARE_AUTH_OVERRIDE_PATH)
  if (process.env.LLM_DASH_VOIDWARE_SKIP_KEYRING === '1') ctx.skipKeyring = true
  return ctx
}

function resolveServiceModule() {
  const candidates = [
    process.env.VOIDWARE_CLI_SERVICE_MODULE,
    join(homedir(), 'Repos', 'voidware', 'packages', 'cli', 'dist', 'service', 'index.js'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const absolute = resolve(String(candidate))
    if (existsSync(absolute)) return absolute
  }
  throw Object.assign(
    new Error('Voidware 0.9.10 CLI bridge unavailable. Build /home/phxntom/Repos/voidware/packages/cli or set VOIDWARE_CLI_SERVICE_MODULE.'),
    { code: 'bridge_unavailable' },
  )
}

async function loadService() {
  if (service) return service
  const major = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (!Number.isFinite(major) || major < 20) {
    throw Object.assign(new Error('Voidware app approval bridge requires Node >=20.'), { code: 'node_unsupported' })
  }
  const modulePath = resolveServiceModule()
  const loaded = await import(pathToFileURL(modulePath).href)
  const required = [
    'createAppOwnedAuthBroker',
    'detectLocalAuthBroker',
    'createLocalAuthBrokerClient',
    'requestDurableVoidwareAuthGrant',
    'BrokerRequestError',
    'AuthService',
  ]
  for (const key of required) {
    if (!(key in loaded)) throw Object.assign(new Error(`Voidware service module is missing ${key}. Rebuild Voidware 0.9.10.`), { code: 'bridge_unavailable' })
  }
  service = { ...loaded, modulePath }
  return service
}

function approvalSummary(request) {
  return {
    requestId: request.requestId,
    app: request.app || APP_NAME,
    repoPath: request.repoPath || ROOT,
    operation: request.operation,
    target: request.operation && request.operation.target ? request.operation.target : '',
    scopes: Array.isArray(request.scopes) ? request.scopes : [],
    ttl: request.ttlLabel || MAX_GRANT_TTL,
    timeoutMs: request.timeoutMs || APPROVAL_TIMEOUT_MS,
    allowSecretOutput: Boolean(request.allowSecretOutput),
    passwordRequired: Boolean(request.passwordRequired),
    secretRequired: Boolean(request.secretRequired),
  }
}

function sameApprovalRequest(left, right) {
  if (!left || !right) return false
  const leftOperation = left.operation && left.operation.kind ? left.operation.kind : ''
  const rightOperation = right.operation && right.operation.kind ? right.operation.kind : ''
  const leftTarget = left.operation && left.operation.target ? left.operation.target : ''
  const rightTarget = right.operation && right.operation.target ? right.operation.target : ''
  return leftOperation === rightOperation && leftTarget === rightTarget
}

function requestApproval(request) {
  if (pendingApproval) {
    if (sameApprovalRequest(pendingApproval.approval, request)) {
      return new Promise((resolveApproval) => {
        pendingApproval.waiters.push(resolveApproval)
      })
    }
    return Promise.resolve({
      ok: false,
      code: 'approval_pending',
      message: 'Finish the open approval first.',
      approval: pendingApproval.approval,
    })
  }
  return new Promise((resolveApproval) => {
    pendingApproval = {
      requestId: request.requestId,
      approval: approvalSummary(request),
      waiters: [resolveApproval],
      createdAt: Date.now(),
    }
  })
}

async function ensureBroker() {
  const api = await loadService()
  const ctx = context()
  const existing = await api.detectLocalAuthBroker(ctx)
  if (existing) {
    if (existing.canApprove) {
      return { status: existing, owned: false }
    }
    throw Object.assign(new Error('A background Voidware auth broker is already running without an approval surface.'), {
      code: 'broker_conflict',
      details: { status: existing },
    })
  }
  if (!broker) {
    broker = api.createAppOwnedAuthBroker({
      approvalSurface: {
        kind: 'app',
        requestApproval,
        cancelPending(requestId, reason) {
          if (pendingApproval && pendingApproval.requestId === requestId) {
            for (const resolveApproval of pendingApproval.waiters) {
              resolveApproval({ ok: false, code: reason === 'timeout' ? 'approval_timeout' : 'approval_denied', message: `approval ${reason}` })
            }
            pendingApproval = null
          }
        },
      },
    })
    await broker.start(ctx)
    ownsBroker = true
  }
  const status = await api.detectLocalAuthBroker(ctx)
  return { status, owned: true }
}

function grantMetadata(data) {
  const source = data && typeof data === 'object' ? data : {}
  const grant = source.grant && typeof source.grant === 'object' ? source.grant : {}
  const out = {}
  for (const key of ['expiresAt', 'ttlMs', 'recommendedTtlMs', 'maxTtlMs', 'renewAfter', 'renewalWindowStartsAt', 'renewalRecommended']) {
    if (grant[key] !== undefined) out[key] = grant[key]
    else if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

function brokerPayload(operation, target, params = {}) {
  return {
    app: APP_NAME,
    repoPath: ROOT,
    operation,
    target,
    scopes: [target ? `${operation}:${target}` : operation],
    ttl: MAX_GRANT_TTL,
    timeoutMs: APPROVAL_TIMEOUT_MS,
    allowSecretOutput: operation === 'auth:secret:read',
    ...(Object.keys(params).length ? { params } : {}),
  }
}

async function startGrant(target, forceRefresh = false) {
  const api = await loadService()
  await ensureBroker()
  if (pendingApproval && sameApprovalRequest(pendingApproval.approval, { operation: { kind: 'auth:secret:read', target } })) {
    return {
      ok: false,
      code: 'approval_pending',
      operationId: activeGrant && activeGrant.operationId ? activeGrant.operationId : randomUUID(),
      approval: pendingApproval.approval,
    }
  }
  const operationId = randomUUID()
  const promise = Promise.resolve().then(() =>
    api.requestDurableVoidwareAuthGrant(
      brokerPayload('auth:secret:read', target),
      context(),
      { forceRefresh },
    ),
  )
  activeGrant = { operationId, target, promise }
  const result = await raceForPending(promise)
  if (result.type === 'pending') {
    return {
      ok: false,
      code: 'approval_pending',
      operationId,
      approval: pendingApproval.approval,
    }
  }
  if (result.type === 'error') throw result.err
  return responseFromBrokerGrant(result.value, operationId, target)
}

async function startBrokerRequest(operation, target, params = {}) {
  const api = await loadService()
  await ensureBroker()
  if (pendingApproval && sameApprovalRequest(pendingApproval.approval, { operation: { kind: operation, target } })) {
    return {
      ok: false,
      code: 'approval_pending',
      operationId: activeGrant && activeGrant.operationId ? activeGrant.operationId : randomUUID(),
      approval: pendingApproval.approval,
    }
  }
  const operationId = randomUUID()
  const promise = Promise.resolve().then(() =>
    api.createLocalAuthBrokerClient(context()).request(brokerPayload(operation, target, params)),
  )
  activeGrant = { operationId, target, promise }
  const result = await raceForPending(promise)
  if (result.type === 'pending') {
    return {
      ok: false,
      code: 'approval_pending',
      operationId,
      approval: pendingApproval.approval,
    }
  }
  if (result.type === 'error') throw result.err
  activeGrant = null
  return responseFromBrokerGrant(result.value, operationId, target)
}

function responseFromBrokerGrant(response, operationId, target) {
  if (!response || !response.ok) {
    const code = response && response.error ? response.error.code : 'broker_error'
    return {
      ok: false,
      code,
      message: response && response.error ? response.error.message : 'Voidware broker request failed',
      operationId,
      ...((code === 'approval_pending' || code === 'approval_waiting') && pendingApproval ? { approval: pendingApproval.approval } : {}),
    }
  }
  const nested = response.data && typeof response.data === 'object' && response.data.data && typeof response.data.data === 'object'
    ? response.data.data
    : {}
  return {
    ok: true,
    operationId,
    target: target || (activeGrant && activeGrant.target ? activeGrant.target : undefined),
    grant: grantMetadata(response.data || {}),
    ...(typeof nested.secret === 'string' ? { secret: nested.secret } : {}),
  }
}

function raceForPending(promise) {
  return Promise.race([
    promise.then((value) => ({ type: 'done', value }), (err) => ({ type: 'error', err })),
    new Promise((resolvePending) => {
      const tick = () => {
        if (pendingApproval) resolvePending({ type: 'pending' })
        else setTimeout(tick, 20)
      }
      tick()
    }),
  ])
}

function chainedApprovalCompatible(chainedReq, originalResult) {
  if (!chainedReq || !chainedReq.approval) return false
  const approval = chainedReq.approval
  if (approval.passwordRequired && !originalResult.password) return false
  if (approval.secretRequired && !originalResult.secret) return false
  if (!approval.passwordRequired && !approval.secretRequired) return true
  return true
}

async function approve(payload) {
  if (!pendingApproval) return { ok: false, code: 'approval_not_found', message: 'No Voidware approval is pending.' }
  const current = pendingApproval
  pendingApproval = null
  const approvalResult = {
    ok: true,
    ...(payload && typeof payload.password === 'string' && payload.password ? { password: payload.password } : {}),
    ...(payload && typeof payload.secret === 'string' && payload.secret ? { secret: payload.secret } : {}),
    ttl: MAX_GRANT_TTL,
  }
  for (const resolveApproval of current.waiters) {
    resolveApproval(approvalResult)
  }
  if (!activeGrant) return { ok: true }
  const grant = activeGrant
  const grantTarget = grant.target
  let chained = 0
  try {
    while (chained < MAX_CHAINED_APPROVALS) {
      const result = await raceForPending(grant.promise)
      if (result.type === 'pending') {
        const chainedReq = pendingApproval
        if (!chainedApprovalCompatible(chainedReq, approvalResult)) {
          return {
            ok: false,
            code: 'approval_pending',
            operationId: grant.operationId,
            approval: chainedReq ? chainedReq.approval : null,
          }
        }
        pendingApproval = null
        for (const resolveApproval of chainedReq.waiters) {
          resolveApproval(approvalResult)
        }
        chained += 1
        continue
      }
      if (result.type === 'error') throw result.err
      if (!pendingApproval) activeGrant = null
      return responseFromBrokerGrant(result.value, grant.operationId, grantTarget)
    }
    activeGrant = null
    return { ok: false, code: 'approval_pending', message: 'Voidware requested too many sequential approvals.', operationId: grant.operationId, approval: pendingApproval ? pendingApproval.approval : null }
  } finally {
    if (!pendingApproval) activeGrant = null
  }
}

function deny() {
  if (!pendingApproval) return { ok: false, code: 'approval_not_found', message: 'No Voidware approval is pending.' }
  for (const resolveApproval of pendingApproval.waiters) {
    resolveApproval({ ok: false, code: 'approval_denied', message: 'Access denied in LLM-Dash.' })
  }
  pendingApproval = null
  activeGrant = null
  return { ok: false, code: 'approval_denied', message: 'Access denied.' }
}

async function status() {
  const api = await loadService()
  const detected = await api.detectLocalAuthBroker(context())
  if (detected) return { ok: true, status: detected, owned: ownsBroker && detected.approvalSurface === 'app' }
  const started = await ensureBroker()
  return { ok: true, status: started.status, owned: started.owned, serviceModule: service.modulePath }
}

async function discoverProviders(payload = {}) {
  await loadService()
  const auth = new service.AuthService(context())
  const data = await auth.discoverProviders({
    filter: {
      reusability: payload.reusableOnly === false ? undefined : 'reusable',
      hasSecret: payload.hasSecret === false ? undefined : true,
    },
  })
  return { ok: true, data }
}

async function writeSecret(payload = {}) {
  return await startBrokerRequest('auth:secret:write', payload.name, {
    secret: payload.secret,
    template: 'custom-http',
    metadata: payload.metadata || {},
    custom: payload.custom || {},
  })
}

async function deleteSecret(payload = {}) {
  return await startBrokerRequest('auth:secret:delete', payload.name)
}

async function stop() {
  if (broker && ownsBroker) await broker.stop().catch(() => undefined)
  broker = null
  ownsBroker = false
  return { ok: true }
}

async function handle(message) {
  switch (message.command) {
    case 'status':
    case 'start':
      return await status()
    case 'stop':
      return await stop()
    case 'pendingApproval':
      return { ok: true, pending: pendingApproval ? pendingApproval.approval : null }
    case 'approve':
      return await approve(message.payload || {})
    case 'deny':
      return deny()
    case 'discoverProviders':
      return await discoverProviders(message.payload || {})
    case 'readSecretGrant':
      return await startGrant(String(message.payload?.name || ''), Boolean(message.payload?.forceRefresh))
    case 'writeSecret':
      return await writeSecret(message.payload || {})
    case 'deleteSecret':
      return await deleteSecret(message.payload || {})
    default:
      return { ok: false, code: 'invalid_request', message: `Unknown bridge command: ${message.command}` }
  }
}

const rl = createInterface({ input: process.stdin })
let inFlightCommands = 0
let stdinClosed = false
rl.on('line', async (line) => {
  inFlightCommands += 1
  let message
  try {
    message = JSON.parse(line)
  } catch {
    write({ id: null, ok: false, code: 'invalid_json', message: 'Invalid JSON command.' })
    inFlightCommands -= 1
    return
  }
  try {
    const result = await handle(message)
    write({ id: message.id, ...result })
  } catch (err) {
    const payload = errorPayload(err)
    write({ id: message.id, ...payload })
  } finally {
    inFlightCommands -= 1
    if (stdinClosed && inFlightCommands === 0) {
      await stop()
      process.exit(0)
    }
  }
})
rl.on('close', async () => {
  stdinClosed = true
  if (inFlightCommands === 0) {
    await stop()
    process.exit(0)
  }
})

process.on('SIGTERM', async () => {
  await stop()
  process.exit(0)
})
process.on('SIGINT', async () => {
  await stop()
  process.exit(0)
})
