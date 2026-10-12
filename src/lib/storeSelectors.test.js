import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arnieTextNumber } from './arnieReach'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '..')

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name)
  if (statSync(full).isDirectory()) return walk(full)
  return /\.(jsx?|tsx?)$/.test(name) ? [full] : []
})

describe('a zustand selector must not build a new object each call', () => {
  // THE BUG THIS EXISTS FOR
  //
  // `useStore(s => arnieTextNumber(s.settings))` returned a fresh
  // { raw, pretty } on every call. Zustand compares a selector's result with
  // Object.is, so the component looked changed on every store notification —
  // render, re-select, render — until React gave up with "maximum update
  // depth exceeded" (minified error #185) and took the whole page down.
  //
  // It only bit where a Twilio number is configured: with none the function
  // returns a stable null. So HHH crashed on every page that can open Arnie,
  // the demo company never did, and it survived review and a day of use.
  // Pressing "Ask Arnie" killed whatever page you were on.
  //
  // The rule: select STATE, derive in useMemo.
  it('arnieTextNumber really does return a new object each call', () => {
    const settings = [{ key: 'twilio_config', value: { from_number: '+13859554477' } }]
    const a = arnieTextNumber(settings)
    const b = arnieTextNumber(settings)
    expect(a).toEqual(b)
    // Equal in value, different in identity — which is the whole problem.
    expect(a).not.toBe(b)
  })

  it('and returns a stable null when nothing is configured — why it hid', () => {
    expect(arnieTextNumber([])).toBe(null)
    expect(arnieTextNumber([])).toBe(arnieTextNumber([]))
  })

  it('nothing in the app calls a function inside a useStore selector', () => {
    // A selector body of `s => s.something` is always safe. One that CALLS
    // something may build a fresh object or array, and that is the footgun.
    const offenders = []
    for (const file of walk(SRC)) {
      if (/\.test\.[jt]sx?$/.test(file)) continue
      // Code only. The fix for this bug is explained in comments that quote
      // the broken line verbatim, and a scanner that reads its own
      // documentation reports the thing that was already fixed.
      const src = readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n')
      const re = /useStore\(\s*\(?\s*[a-zA-Z_$]+\s*\)?\s*=>\s*([a-zA-Z_$][\w$]*)\s*\(/g
      let m
      while ((m = re.exec(src))) {
        offenders.push(`${file.slice(SRC.length + 1).replace(/\\/g, '/')} — ${m[1]}(...)`)
      }
    }
    expect(offenders, 'select state and derive it in useMemo instead').toEqual([])
  })
})
