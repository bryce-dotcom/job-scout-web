// What somebody typed into "which program?" → the names that actually grant.
//
// A grant only works if its name is EXACTLY the app name an action carries.
// The box is free text, so Bryce typed "chrome, google suite, exel, windows"
// and got ONE grant called all of that. It sat at tier "full" looking like
// permission and matching no program that has ever existed — the same
// silent-no-op shape as everything else found today.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const load = (src) => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, () => ({}))
  return m.exports
}
const G = load(read('../../supabase/functions/_shared/computerGrants.ts'))
const fn = read('../../supabase/functions/arnie-computer/index.ts')

describe('one name or several', () => {
  it('splits the exact thing that was broken', () => {
    expect(G.appNames('chrome, google suite, exel, windows'))
      .toEqual(['chrome', 'google suite', 'excel', 'windows'])
  })

  it('takes the separators people actually use', () => {
    expect(G.appNames('chrome and excel')).toEqual(['chrome', 'excel'])
    expect(G.appNames('chrome; outlook')).toEqual(['chrome', 'outlook'])
    expect(G.appNames('chrome\nexcel')).toEqual(['chrome', 'excel'])
  })

  it('corrects only the unambiguous spellings', () => {
    expect(G.appNames('Exel')).toEqual(['excel'])
    expect(G.appNames('Google Chrome')).toEqual(['chrome'])
    expect(G.appNames('Microsoft Word')).toEqual(['word'])
    expect(G.appNames('File Explorer')).toEqual(['explorer'])
  })

  it('leaves a name it does not know exactly as typed', () => {
    // A tenant's own web app is a legitimate name, and guessing at it would
    // be worse than leaving it alone.
    expect(G.appNames('housecallpro')).toEqual(['housecallpro'])
    expect(G.appNames('TrakSmart')).toEqual(['traksmart'])
  })

  it('tidies without mangling', () => {
    expect(G.appNames('  Chrome.  ')).toEqual(['chrome'])
    expect(G.appNames('google   sheets')).toEqual(['google sheets'])
  })

  it('does not repeat itself, and cannot be used to flood the table', () => {
    expect(G.appNames('chrome, Chrome, CHROME')).toEqual(['chrome'])
    expect(G.appNames(Array.from({ length: 40 }, (_, i) => 'app' + i).join(',')).length).toBe(10)
  })

  it('an empty or junk entry grants nothing', () => {
    expect(G.appNames('')).toEqual([])
    expect(G.appNames('   ,  , ')).toEqual([])
    expect(G.appNames('x'.repeat(80))).toEqual([])
  })
})

describe('the narrowest permission still wins, but says so', () => {
  it('a grant is made per name', () => {
    expect(fn).toMatch(/const apps = appNames\(String\(body\.app \|\| ''\)\)/)
    expect(fn).toMatch(/JSON\.stringify\(apps\.map\(\(app\) => \(\{/)
  })

  it('an overriding narrower grant is reported back', () => {
    // Correct behaviour, baffling in silence: you allow Chrome properly and
    // nothing changes, because an old "watch" outranks it.
    expect(fn).toMatch(/TIER_RANK\[String\(g\.tier\)/)
    expect(fn).toMatch(/narrower: narrower\.map/)
  })

  it('and the screen says it rather than leaving them to guess', () => {
    const ui = read('../pages/agents/arnie/ArnieComputer.jsx')
    expect(ui).toMatch(/setNarrower\(res\?\.narrower \|\| null\)/)
    expect(ui).toMatch(/the narrower one wins/)
  })
})
