// Vercel cron — puts coordinates on leads so they show up on the Liahona map.
//
// The initial 869 pins came from a one-off script. Every lead created or
// re-addressed after that would have sat unpinned, because leads are written
// from a dozen places and none of them geocode. Rather than patch each caller,
// a trigger (20260914200000_leads_geocode_on_save.sql) clears coordinates when
// an address changes, and this cron fills whatever is empty.
//
// Every 10 minutes: up to BATCH leads with an address and no coordinates.
// Misses get geocode_failed_at so junk addresses ("UT", "Denver, CO") are not
// retried every run; they come back after 7 days, or immediately if edited.
//
// Census is queried a few at a time; the Nominatim fallback is paced at one
// request per second per its policy, so only NOMINATIM_CAP misses per run go
// that route. A big backlog drains over a few runs instead of one long one.

const { createClient } = require('@supabase/supabase-js')
const { geocodeAddress, homeFor, looksGeocodable } = require('../_lib/geocodeAddress')

const BATCH = 60
const NOMINATIM_CAP = 25
const RETRY_AFTER_DAYS = 7

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })

  try {
    const sb = createClient(url, key, { auth: { persistSession: false } })
    const retryBefore = new Date(Date.now() - RETRY_AFTER_DAYS * 86400e3).toISOString()
    const now = new Date().toISOString()
    let nominatimUsed = 0

    // Leads and jobs share the run: jobs got coordinates too (migration
    // 20260924120000) so the map can show finished work. Same rules, the
    // address column differs. Leads first, then jobs with what is left.
    const TABLES = [
      { table: 'leads', column: 'address' },
      { table: 'jobs', column: 'job_address' },
    ]
    const report = {}
    // A city-less address is read as near the tenant's home (companies row,
    // resolved once per company per run). See geocodeAddress.js.
    const homes = new Map()
    const homeOf = async (companyId) => {
      if (!homes.has(companyId)) {
        const { data: co } = await sb.from('companies').select('id, address, city, state, zip').eq('id', companyId).maybeSingle()
        homes.set(companyId, await homeFor(co))
      }
      return homes.get(companyId)
    }
    let budget = BATCH
    for (const { table, column } of TABLES) {
      if (budget <= 0) { report[table] = { considered: 0, note: 'no budget left this run' }; continue }
      const { data: pending, error } = await sb
        .from(table)
        .select(`id, company_id, ${column}`)
        .is('latitude', null)
        .not(column, 'is', null)
        .neq(column, '')
        .or(`geocode_failed_at.is.null,geocode_failed_at.lt.${retryBefore}`)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(budget)
      if (error) return res.status(500).json({ error: `${table}: ${error.message}` })

      let pinned = 0, failed = 0, skipped = 0
      const failures = []
      for (const row of pending || []) {
        const address = row[column]
        if (!looksGeocodable(address)) {
          skipped += 1
          await sb.from(table).update({ geocode_failed_at: now }).eq('id', row.id).is('latitude', null)
          continue
        }
        const home = await homeOf(row.company_id)
        const hit = await geocodeAddress(address, { allowNominatim: nominatimUsed < NOMINATIM_CAP, home })
        if (hit?.source === 'nominatim') nominatimUsed += 1
        if (hit) {
          const { error: uerr } = await sb.from(table)
            .update({ latitude: hit.lat, longitude: hit.lng, geocoded_at: now, geocode_failed_at: null })
            .eq('id', row.id).is('latitude', null)   // don't overwrite a pin placed meanwhile
          if (uerr) failures.push({ id: row.id, error: uerr.message }); else pinned += 1
        } else {
          failed += 1
          await sb.from(table).update({ geocode_failed_at: now }).eq('id', row.id).is('latitude', null)
        }
      }
      const limitUsed = budget
      budget -= (pending || []).length
      report[table] = {
        considered: (pending || []).length, pinned, failed, skipped,
        remaining: (pending || []).length === limitUsed ? 'likely more — next run continues' : 0,
        failures,
      }
    }

    const anyFailure = Object.values(report).some(r => r.failures?.length)
    report.homes = Object.fromEntries([...homes].map(([id, h]) => [id, h ? `${h.city}, ${h.state}` : null]))
    return res.status(anyFailure ? 500 : 200).json({ nominatimUsed, ...report })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
