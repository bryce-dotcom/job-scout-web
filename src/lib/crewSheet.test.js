// The crew sheet (2026-10-26): what London had Grok build from JobScout
// exports, built from JobScout itself — with the clocked hours Grok lacked.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  reachFor, heightFromNotes, matchAreas, installNote, isFixture, rateFromHistory, laborFor, pullList, flagsFor,
} from '../../supabase/functions/_shared/crewSheet.ts'
import { generateCrewSheetPdf, laborWords, reachWords, crewSheetFilename } from './crewSheetPdf'
import { weekOf } from '../pages/CrewSheet.jsx'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('ladder or lift', () => {
  it.each([[9, false, 'ladder'], [12, false, 'ladder'], [15, false, 'scissor lift'], [21, false, 'scissor lift'], [30, false, 'boom lift'], [9, true, 'scissor lift'], [null, true, 'scissor lift'], [null, false, null]])('%s ft, lift on the bid %s → %s', (h, lift, want) => {
    expect(reachFor(h, lift)).toBe(want)
  })
  it('reads the height off a line note', () => {
    expect(heightFromNotes('Office Upstairs · 9 ft · 96W T8 → 34W LED')).toBe(9)
    expect(heightFromNotes('Shop · 21ft · 324W T5')).toBe(21)
    expect(heightFromNotes('LLLC controls')).toBe(null)
  })
})

describe('which audit area a line installs into', () => {
  const areas = [
    { area_name: 'Office Upstairs', ceiling_height: 9, product_qty: 19, led_replacement_id: 2169, existing_wattage: 96, led_wattage: 34, lighting_type: 'T8' },
    { area_name: 'Shop', ceiling_height: 21, product_qty: 21, led_replacement_id: 1381, existing_wattage: 324, led_wattage: 150, lighting_type: 'T5' },
    { area_name: 'Office', ceiling_height: 9, product_qty: 6, led_replacement_id: 1453, existing_wattage: 64, led_wattage: 38, lighting_type: 'T8' },
  ]
  const lines = [
    { id: 1, item_id: 1428, quantity: 19, notes: 'Office Upstairs · 9 ft · 96W T8 → 34W LED' },
    { id: 2, item_id: 1381, quantity: 21, notes: null },
    { id: 3, item_id: 1453, quantity: 6, notes: null },
  ]
  const m = matchAreas(lines, areas)
  it('by its note, then by product and quantity', () => {
    expect(m.get(1).area_name).toBe('Office Upstairs')
    expect(m.get(2).area_name).toBe('Shop')
    expect(m.get(3).area_name).toBe('Office')
  })
  it('a line with no note gets one from its area', () => {
    expect(installNote(lines[1], m.get(2))).toBe('Shop · 21 ft · 324W T5 → 150W LED')
    expect(installNote(lines[0], m.get(1))).toBe('Office Upstairs · 9 ft · 96W T8 → 34W LED')
  })
})

describe('a fixture is a fixture by its name, not its labor tag', () => {
  it('the Step Saver "LIFT w/ Controls" highbay bundle (filed as labor) counts', () => {
    expect(isFixture({ name: 'SMBE 90/110/130/150/165W Highbay - 2ft LIFT w/ Controls', material_or_labor: 'labor' })).toBe(true)
  })
  it.each(['ES LIFT ', 'Electrical labor per hour', 'Exterior WaterFed windows above 2 stories'])('not a fixture: %s', (name) => {
    expect(isFixture({ name })).toBe(false)
  })
})

describe('how long, from clocked hours', () => {
  const history = [0.26, 0.6, 0.7, 0.9, 1.0, 1.1, 1.3, 2.0, 0.8].map((r) => ({ hours: r * 20, fixtures: 20 }))
  it('the median and the middle half, with how many jobs', () => {
    expect(rateFromHistory(history)).toEqual({ median: 0.9, low: 0.7, high: 1.1, jobs: 9 })
  })
  it('too few jobs, or jobs too small to say anything, is no estimate', () => {
    expect(rateFromHistory(history.slice(0, 4))).toBe(null)
    expect(rateFromHistory(history.map((h) => ({ ...h, fixtures: 3 })))).toBe(null)
  })
  it('59 fixtures, 3 guys, a 7.5 h plan — the plan is said beside the history', () => {
    const l = laborFor(59, 3, { median: 0.94, low: 0.72, high: 1.26, jobs: 56 }, 7.5, 89.4)
    expect(l.crewHours).toEqual({ median: 55.5, low: 42.5, high: 74.3 })
    expect(l.onSiteHours.median).toBe(18.5)
    expect(l.days).toBe(3)
    expect(l.planned).toEqual({ hours: 7.5, crewHours: 22.5, perFixture: 0.38 })
    const w = laborWords(l)
    expect(w.est).toMatch(/55\.5 crew-hrs \(most similar jobs: 42\.5–74\.3\)/)
    expect(w.plan).toMatch(/The plan is well under what past jobs took/)
    expect(w.basis).toMatch(/56 past jobs/)
  })
})

describe('the pull list', () => {
  const P = new Map([
    [1428, { id: 1428, name: 'Panel w/ Controls' }], [2131, { id: 2131, name: 'MES Panel', vendor_sku: '2852' }], [2150, { id: 2150, name: 'MES Panel Control', vendor_sku: '06903' }],
    [1381, { id: 1381, name: 'Highbay LIFT w/ Controls' }], [2123, { id: 2123, name: 'MES Highbay', vendor_sku: '09241-03' }], [1505, { id: 1505, name: 'ES LIFT', material_or_labor: 'labor' }],
  ])
  const C = new Map([[1428, [{ id: 2131, qty: 1 }, { id: 2150, qty: 1 }]], [1381, [{ id: 2123, qty: 1 }, { id: 1505, qty: 1 }]]])
  it('a bundle is its parts, summed across lines; labor is not pulled', () => {
    const list = pullList([{ item_id: 1428, quantity: 19 }, { item_id: 1428, quantity: 7 }, { item_id: 1381, quantity: 21 }], P, C)
    expect(list.map((x) => [x.name, x.order_code, x.qty])).toEqual([['MES Panel', '2852', 26], ['MES Panel Control', '06903', 26], ['MES Highbay', '09241-03', 21]])
  })
})

describe('what to confirm before rolling', () => {
  const lines = [{ id: 1, item_id: 1428, quantity: 19, is_fixture: true, product_name: 'Panel 23/30/35/40/50W', notes: 'Office Upstairs · 9 ft' }]
  it('a fixture the estimate did not sell, parts not received, no crew', () => {
    const f = flagsFor({}, lines, [{ item_id: 2169, quantity: 19 }], new Map([[1, { area_name: 'Office Upstairs', ceiling_height: 9 }]]), [{ po_number: 'PO-2026-0085', status: 'sent' }], [])
    expect(f).toEqual([
      'No crew is assigned on the job.',
      'Panel 23/30/35/40/50W × 19 (Office Upstairs) is not a product the estimate sold — confirm which one goes up before installing.',
      'Parts not received yet: PO-2026-0085 (sent).',
    ])
  })
  it('nothing to say when it all lines up', () => {
    expect(flagsFor({}, lines, [{ item_id: 1428, quantity: 19 }], new Map([[1, { ceiling_height: 9 }]]), [{ po_number: 'PO-1', status: 'received' }], ['London Miller'])).toEqual([])
  })
})

describe('the printed sheet', () => {
  const sheet = {
    from: '2026-10-26', to: '2026-10-26', tz: 'America/Denver', reach: { ladderMaxFt: 12, scissorMaxFt: 26 }, generated_at: '2026-10-26T14:00:00Z',
    jobs: [{
      id: 1, job_id: 'JOB-MV13157W', title: 'Lighting — Step Saver', status: 'Waiting Product', customer: 'Step Saver', address: '1917 W 2425 S, Woods Cross, UT',
      start: '2026-10-26T15:30:00Z', end: '2026-10-26T23:00:00Z', crew: ['London Miller', 'Mike Thompson', 'Derrick Mctavish'], lead: 'London Miller', sales: 'Noah Sorensen',
      contact: { name: 'Doug Guernsey', phone: '801-294-7977', email: 'doug@step-saver.com' },
      lines: [{ qty: 21, product: 'SMBE Highbay LIFT w/ Controls', note: 'Shop · 21 ft · 324W T5 → 150W LED', height: 21, reach: 'scissor lift', parts: [{ name: 'MES Highbay', order_code: '09241-03' }, { name: 'MES HB Control', order_code: '6906' }], on_po: 'PO-2026-0085', is_fixture: true }],
      reach: { ladder: 0, scissor: 21, boom: 0, maxHeight: 21 }, pos: [{ po_number: 'PO-2026-0085', status: 'sent' }],
      labor: laborFor(59, 3, { median: 0.94, low: 0.72, high: 1.26, jobs: 56 }, 7.5, 89.4), flags: ['Parts not received yet: PO-2026-0085 (sent).'],
    }],
    pull_list: [{ product_id: 2123, name: 'MES Highbay', order_code: '09241-03', qty: 21, allocated: 0, jobs: ['Lighting — Step Saver'] }],
  }
  it('draws headless: header, how long, ladder or lift, what to confirm, lines, pull list', () => {
    const doc = generateCrewSheetPdf(sheet, { company: 'HHH Services, LLC' })
    const raw = doc.output()
    for (const s of ['CREW SHEET', 'HOW LONG', 'LADDER OR LIFT: SCISSOR LIFT for 21', 'CONFIRM BEFORE ROLLING', 'Pull list', 'Doug Guernsey', '09241-03']) expect(raw).toContain(s)
    expect(raw).not.toMatch(/\$\d/)
    expect(crewSheetFilename(sheet)).toBe('Crew_Sheet_2026-10-26.pdf')
    expect(reachWords(sheet.jobs[0].reach)).toBe('SCISSOR LIFT for 21 (highest 21 ft)')
  })
  it('a week is Monday to Friday', () => {
    expect(weekOf('2026-10-28')).toEqual({ from: '2026-10-26', to: '2026-10-30' })
    expect(weekOf('2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-10-30' })
  })
})

describe('the wiring', () => {
  it('the page is routed, on the app map, and on the Job Board', () => {
    expect(read('src/App.jsx')).toMatch(/<Route path="\/crew-sheet" element=\{<CrewSheet \/>\} \/>/)
    expect(read('supabase/functions/_shared/appMap.ts')).toMatch(/route: '\/crew-sheet', label: 'Crew Sheet'/)
    expect(read('src/pages/PMJobSetter.jsx')).toMatch(/navigate\('\/crew-sheet'\)/)
  })
  it('a Team Lead or above sees every crew; anyone else only their own jobs — on the page and from Jenny', () => {
    const fn = read('supabase/functions/crew-sheet/index.ts')
    expect(fn).toMatch(/resolveCaller\(req, URL_, KEY, \{ verify: true \}\)/)
    expect(fn).toMatch(/if \(caller\.level < 1\) \{/)
    const chat = read('supabase/functions/arnie-chat/index.ts')
    expect(chat).toMatch(/name: 'query_crew_sheet'/)
    expect(chat).toMatch(/if \(name === 'query_crew_sheet'\) \{[\s\S]{0,1200}if \(caller\.level < 1\) \{/)
    expect(read('supabase/functions/_shared/arnieReceipt.ts')).toMatch(/query_crew_sheet: 'crew sheet'/)
  })
  it('the crew rule is the one shared rule, re-exported by the app', () => {
    expect(read('src/lib/crewRoster.js')).toMatch(/export \* from '\.\.\/\.\.\/supabase\/functions\/_shared\/crewRoster\.ts'/)
    expect(read('supabase/functions/_shared/crewSheetData.ts')).toMatch(/import \{ parseCrew, isOnCrew \} from '\.\/crewRoster\.ts'/)
  })
})

// A stored midnight UTC is a date, not 6 pm the evening before (demo jobs, 2026-10-26).
import { scheduleDay, isDateOnly } from '../../supabase/functions/_shared/crewSheetData.ts'
describe('the day a job is on', () => {
  it('a date-only schedule stays on its own day; a real time is read in the zone', () => {
    expect(isDateOnly('2026-08-19T00:00:00+00:00')).toBe(true)
    expect(scheduleDay('2026-08-19T00:00:00+00:00', 'America/Denver')).toBe('2026-08-19')
    expect(scheduleDay('2026-10-26T15:30:00+00:00', 'America/Denver')).toBe('2026-10-26')
    expect(scheduleDay('2026-10-27T03:30:00+00:00', 'America/Denver')).toBe('2026-10-26')
    expect(scheduleDay(null, 'America/Denver')).toBe(null)
  })
})
