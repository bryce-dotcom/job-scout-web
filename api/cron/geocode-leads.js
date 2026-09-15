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
const { geocodeAddress, looksGeocodable } = require('../_lib/geocodeAddress')

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

    const { data: pending, error } = await sb
      .from('leads')
      .select('id, company_id, address')
      .is('latitude', null)
      .not('address', 'is', null)
      .neq('address', '')
      .or(`geocode_failed_at.is.null,geocode_failed_at.lt.${retryBefore}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(BATCH)
    if (error) return res.status(500).json({ error: error.message })

    const now = new Date().toISOString()
    let pinned = 0, failed = 0, skipped = 0, nominatimUsed = 0
    const failures = []

    for (const lead of pending || []) {
      if (!looksGeocodable(lead.address)) {
        skipped += 1
        await sb.from('leads').update({ geocode_failed_at: now }).eq('id', lead.id).is('latitude', null)
        continue
      }
      const hit = await geocodeAddress(lead.address, { allowNominatim: nominatimUsed < NOMINATIM_CAP })
      if (hit?.source === 'nominatim') nominatimUsed += 1
      if (hit) {
        const { error: uerr } = await sb.from('leads')
          .update({ latitude: hit.lat, longitude: hit.lng, geocoded_at: now, geocode_failed_at: null })
          .eq('id', lead.id).is('latitude', null)   // don't overwrite a pin placed meanwhile
        if (uerr) failures.push({ id: lead.id, error: uerr.message }); else pinned += 1
      } else {
        failed += 1
        await sb.from('leads').update({ geocode_failed_at: now }).eq('id', lead.id).is('latitude', null)
      }
    }

    return res.status(failures.length ? 500 : 200).json({
      considered: (pending || []).length, pinned, failed, skipped, nominatimUsed,
      remaining: (pending || []).length === BATCH ? 'likely more — next run continues' : 0,
      failures,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
