import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sinceLastWorkday } from '../../supabase/functions/_shared/arnieRefresh.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const refresh = read('../../supabase/functions/_shared/arnieRefresh.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const ship = read('../../scripts/ship.mjs')

describe("Cole's routines look back to the last workday", () => {
  it('Tuesday looks at Monday; Monday looks at Friday', () => {
    expect(sinceLastWorkday('2026-10-13', 'UTC')).toBe('2026-10-12T00:00:00.000Z') // Tue → Mon
    expect(sinceLastWorkday('2026-10-12', 'UTC')).toBe('2026-10-09T00:00:00.000Z') // Mon → Fri
  })
})

describe('the refresh has every item on his list', () => {
  it('lead setter check: new meetings, approved estimates not yet jobs', () => {
    expect(refresh).toMatch(/new_meetings_booked_since/)
    expect(refresh).toMatch(/status=eq\.Approved&job_id=is\.null/)
  })
  it('daily refresh: leads, drafts, sent, approved, meetings, tickets, banners, stale, overdue', () => {
    for (const k of ['new_leads', 'new_draft_estimates', 'moved_to_sent', 'moved_to_approved', 'todays_meetings', 'tickets', 'sync_banners', 'stale_estimates', 'overdue_invoices']) expect(refresh).toMatch(new RegExp(`${k}:`))
  })
  it('scoped like the brief: banners and overdue are admin, stale is manager', () => {
    expect(refresh).toMatch(/sync_banners: admin \?/)
    expect(refresh).toMatch(/overdue_invoices: admin \?/)
    expect(refresh).toMatch(/stale_estimates: manager \?/)
  })
  it('is a tool Arnie has', () => {
    expect(chat).toMatch(/name: 'query_jobscout_refresh'/)
    expect(chat).toMatch(/if \(name === 'query_jobscout_refresh'\)/)
  })
})

describe('release notes: every ship tells Arnie, and only the platform company hears it', () => {
  it('ship records the landed commits, failing open', () => {
    expect(ship).toMatch(/await recordReleases\(shas\)/)
    expect(ship).toMatch(/app_releases\?on_conflict=sha/)
    expect(ship).toMatch(/note: release notes not recorded/)
  })
  it('arnie-chat shows them to a platform company only', () => {
    expect(chat).toMatch(/\+ await releasesBlock\(companyId\)/)
    expect(chat).toMatch(/is_platform !== true\) return ''/)
  })
})
