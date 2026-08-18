#!/usr/bin/env node
/**
 * Moto Watchdog partner API probe.
 *
 * Run this the moment the $99.99/mo API app is installed. It answers, with
 * real responses rather than inference, the questions that decide whether
 * JobScout can run every tenant through one platform account:
 *
 *   1. Does the /partner/api/v1 path prefix work?  (the old proxy omitted it
 *      and would have 404'd on every call)
 *   2. What does the token actually see — only this company's devices?
 *   3. What are the REAL field names, so the field_map stops being guesses?
 *   4. Is there any per-device attribution (tags / groups / meta) we could use
 *      as the tenant key?
 *   5. Which endpoints are actually reachable on this plan?
 *
 * Usage — put these in .env (or pass as env vars) and run:
 *
 *   WATCHDOG_PARTNER_KEY=...        # the partner key JobScout already holds
 *   WATCHDOG_PLATFORM_AUTH_TOKEN=... # from Dashboard -> Developer -> API Access
 *
 *   node scripts/watchdog-api-probe.mjs
 *
 * Read-only: every request is a GET. Nothing is created, changed, or deleted.
 */

import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '.watchdog-capture')

const PARTNER = process.env.WATCHDOG_PARTNER_KEY || ''
const TOKEN = process.env.WATCHDOG_PLATFORM_AUTH_TOKEN || process.env.WATCHDOG_AUTH_TOKEN || ''

if (!PARTNER || !TOKEN) {
  console.error(`
Missing credentials.

  WATCHDOG_PARTNER_KEY          ${PARTNER ? 'ok' : 'MISSING'}
  WATCHDOG_PLATFORM_AUTH_TOKEN  ${TOKEN ? 'ok' : 'MISSING'}

The auth token comes from the Watchdog dashboard once the "API and Webhook
Access" app is installed: Developer -> API Access.
`)
  process.exit(1)
}

// Both prefixes get tried. The public docs page implies the bare paths; the
// in-app developer docs give /partner/api/v1. Whichever answers is the truth,
// and that's worth settling on the first run rather than debugging later.
const HOST = 'https://partner.api.motowatchdog.com'
const PREFIXES = ['/partner/api/v1', '']

const GETS = [
  ['devices', '/devices'],
  ['trips', '/trips'],
  ['trips_in_progress', '/trips/in_progress'],
  ['trips_completed', '/trips/completed'],
  ['trips_between', `/trips/between?start_date=${daysAgo(7)}&end_date=${daysAgo(0)}`],
  ['alerts', '/alerts'],
  ['geofences', '/geofences'],
  ['analytics', '/analytics'],
  ['webhook_analytics', '/webhooks/analytics'],
]

function daysAgo(n) {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
}

async function call(path) {
  const started = Date.now()
  try {
    const res = await fetch(`${HOST}${path}`, {
      headers: { AUTH_TOKEN: TOKEN, PARTNER, Accept: 'application/json' },
    })
    const text = await res.text()
    let body = null
    try { body = JSON.parse(text) } catch { /* not json — keep the raw text */ }
    return { status: res.status, ok: res.ok, body, raw: body ? null : text.slice(0, 300), ms: Date.now() - started }
  } catch (err) {
    return { status: 0, ok: false, error: err.message, ms: Date.now() - started }
  }
}

/** Find the array in a response, whatever it's wrapped in. */
function findArray(body) {
  if (Array.isArray(body)) return { path: '', rows: body }
  if (!body || typeof body !== 'object') return null
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) return { path: key, rows: value }
    if (value && typeof value === 'object') {
      const nested = findArray(value)
      if (nested) return { path: `${key}${nested.path ? '.' + nested.path : ''}`, rows: nested.rows }
    }
  }
  return null
}

function describe(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value === 'object') return `object{${Object.keys(value).slice(0, 6).join(',')}}`
  if (typeof value === 'string') return value.length > 60 ? `string(${value.length})` : `"${value}"`
  return `${value}`
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log('\nMoto Watchdog API probe')
  console.log('='.repeat(70))

  // ---- 1. Which prefix is real? -------------------------------------
  console.log('\n[1] Resolving the base path')
  let prefix = null
  for (const p of PREFIXES) {
    const res = await call(`${p}/devices`)
    const label = p || '(no prefix)'
    console.log(`    ${String(res.status).padEnd(4)} ${HOST}${p}/devices   ${res.ms}ms`)
    if (res.ok && prefix === null) prefix = p
  }

  if (prefix === null) {
    console.log(`
    Neither prefix returned 2xx. Most likely causes:
      401/403 -> the token isn't active yet, or PARTNER doesn't match it
      404     -> both prefixes wrong; check Developer -> API Documentation
    Stopping here — everything below depends on a working base path.
`)
    process.exit(1)
  }
  console.log(`    -> using "${prefix || '(none)'}"`)

  // ---- 2. Walk every endpoint ---------------------------------------
  console.log('\n[2] Endpoint reachability')
  const results = {}
  for (const [name, path] of GETS) {
    const res = await call(`${prefix}${path}`)
    const found = res.ok ? findArray(res.body) : null
    results[name] = {
      path: `${prefix}${path}`,
      status: res.status,
      ok: res.ok,
      resultPath: found?.path ?? null,
      count: found?.rows.length ?? null,
      sample: found?.rows?.[0] ?? (res.ok ? res.body : null),
      error: res.ok ? null : (res.body?.message || res.body?.error || res.raw || res.error),
    }

    const verdict = res.ok
      ? `${String(found?.rows.length ?? '?').padStart(4)} rows` + (found?.path ? `  under "${found.path}"` : '  (bare array)')
      : `FAILED: ${String(results[name].error).slice(0, 60)}`
    console.log(`    ${String(res.status).padEnd(4)} ${name.padEnd(20)} ${verdict}`)
  }

  // ---- 3. Real field names ------------------------------------------
  console.log('\n[3] Field names on a real device')
  const device = results.devices?.sample
  if (device) {
    for (const [k, v] of Object.entries(device)) {
      console.log(`    ${k.padEnd(30)} ${describe(v)}`)
    }
  } else {
    console.log('    No device returned — register a tracker first.')
  }

  // ---- 4. Tenant attribution ----------------------------------------
  // This is the one that decides whether the platform-account model can
  // work. If a device carries a group/tag/meta marker we can set, that's a
  // clean tenant key. If not, attribution has to live entirely in JobScout
  // via fleet.gps_device_id — which works, but means the whitelist in
  // watchdog-proxy is the ONLY thing separating tenants.
  console.log('\n[4] Tenant attribution')
  if (device) {
    const markers = ['tags', 'group', 'groups', 'group_id', 'meta', 'nickname', 'external_id']
      .filter(k => k in device)
    if (markers.length) {
      for (const k of markers) console.log(`    ${k.padEnd(16)} ${describe(device[k])}`)
    }
    const tenantish = Object.keys(device).filter(k => /company|account|owner|tenant|customer|organization/i.test(k))
    console.log(tenantish.length
      ? `    account-ish fields: ${tenantish.join(', ')}`
      : '    No company/account/owner field — the token IS the tenant boundary.')
    console.log('    -> JobScout must enforce separation itself (watchdog-proxy device whitelist).')
  }

  // ---- 5. What the token can see ------------------------------------
  console.log('\n[5] Visibility')
  console.log(`    devices visible to this token: ${results.devices?.count ?? 'n/a'}`)
  console.log('    Compare against the device count shown in the dashboard.')
  console.log('    If they match, the token is scoped to this one company — which is')
  console.log('    what the platform-account model assumes.')

  const outFile = join(OUT_DIR, 'api-probe.json')
  writeFileSync(outFile, JSON.stringify({
    probedAt: new Date().toISOString(),
    host: HOST,
    prefix,
    results,
  }, null, 2))

  const reachable = Object.values(results).filter(r => r.ok).length
  console.log(`\n${'='.repeat(70)}`)
  console.log(`${reachable}/${GETS.length} endpoints reachable.  Full output: ${outFile}`)
  console.log(`
Next:
  - Hand me api-probe.json and I'll lock the field_map to the real names.
  - Still to answer by hand (the API can't tell you):
      * can a device be TRANSFERRED out when a customer leaves?
      * is Watchdog okay with one company holding many customers' trackers?
`)
}

main().catch(err => { console.error(err); process.exit(1) })
