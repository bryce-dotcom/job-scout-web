import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Marks from './ScoutIcons'
import ScoutMark from './ScoutMark'
import { RAMPS } from './scoutPalette'

const here = dirname(fileURLToPath(import.meta.url))
const NAMES = Object.keys(Marks).filter((k) => k.endsWith('Mark'))

describe('every mark in the drawn menu', () => {
  it('there are as many as the menu needs, and they all render', () => {
    // A number, so deleting one by accident while editing a 900-line file is
    // a failing test rather than a blank square somebody notices in a demo.
    expect(NAMES.length).toBe(43)
    for (const name of NAMES) {
      const html = renderToStaticMarkup(Marks[name]({ size: 24 }))
      expect(html, name).toContain('viewBox="0 0 24 24"')
      expect(html.length, `${name} rendered almost nothing`).toBeGreaterThan(200)
    }
  })

  it('reading a material the mark never declared throws by name', () => {
    // THE BUG THIS REPLACES. fill={m.cooper} is undefined, React drops the
    // attribute, and SVG's default fill paints the shape solid BLACK. It
    // builds, it renders, and at 14px in a sidebar it looks like somebody
    // meant it. The Proxy in ScoutMark turns that into a crash, so the loop
    // above is what actually catches a typo'd material anywhere in the set.
    expect(() =>
      renderToStaticMarkup(<ScoutMark ramps={['brass']}>{(m) => <rect fill={m.cooper} />}</ScoutMark>),
    ).toThrow(/cooper/)
  })

  it('two of the same mark on one page do not share a gradient id', () => {
    // CampfireMark passed its gradient id by hand, which works until the same
    // mark renders in the sidebar, the mobile menu and the tab bar at once —
    // then the second and third inherit the first one's fill. useId() is what
    // makes that impossible; this is the test that says so.
    const Lookout = Marks.LookoutMark
    const html = renderToStaticMarkup(
      <>
        <Lookout size={24} />
        <Lookout size={24} />
      </>,
    )
    const ids = [...html.matchAll(/id="([^"]+-brass)"/g)].map((mm) => mm[1])
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('no mark paints outside the 24-grid it shares with the lucide icons', () => {
    // The set lands one section at a time, so a mark that quietly draws to
    // x=27 sits a third larger than the grey icon above it and makes the
    // whole column look crooked. Checks the plain geometry attributes; paths
    // and rotated groups are judged by eye, which is what the sheet is for.
    const slack = 0.6
    for (const name of NAMES) {
      const html = renderToStaticMarkup(Marks[name]({ size: 24 }))
      for (const [, attr, raw] of html.matchAll(/\s(cx|cy|x|y)="(-?[\d.]+)"/g)) {
        const v = Number(raw)
        expect(v, `${name} ${attr}=${raw}`).toBeGreaterThanOrEqual(-slack)
        expect(v, `${name} ${attr}=${raw}`).toBeLessThanOrEqual(24 + slack)
      }
    }
  })

  it('every ramp a mark asks for is a real material', () => {
    const src = readFileSync(resolve(here, 'ScoutIcons.jsx'), 'utf8')
    const asked = new Set()
    for (const [, list] of src.matchAll(/ramps=\{\[([^\]]*)\]\}/g)) {
      for (const [, n] of list.matchAll(/'([^']+)'/g)) asked.add(n)
    }
    expect(asked.size).toBeGreaterThan(8)
    for (const n of asked) expect(RAMPS, `ramp "${n}"`).toHaveProperty(n)
  })

  it('a ramp runs top to bottom with offsets in order', () => {
    for (const [name, ramp] of Object.entries(RAMPS)) {
      const offsets = ramp.stops.map(([o]) => o)
      expect(offsets[0], name).toBe(0)
      expect(offsets[offsets.length - 1], name).toBe(1)
      for (let i = 1; i < offsets.length; i += 1) {
        expect(offsets[i], `${name} stop ${i}`).toBeGreaterThan(offsets[i - 1])
      }
      for (const [, color] of ramp.stops) expect(color, name).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
