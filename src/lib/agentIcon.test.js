// Arnie's face on the agent window.
//
// Bryce, looking at his taskbar — Chrome, the Scout, and a generic PowerShell
// square: "can we wrap the powershell with the arnie or jennie face?"
//
// The launcher .cmd can never have one. It runs inside the Windows console
// host and borrows that host's icon, and nothing a batch file can do changes
// it — the title has correctly said "JobScout Agent" the whole time. Only a
// real executable can carry an icon, which is one more reason the signed
// build matters.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const at = (p) => resolve(here, p)
const read = (p) => readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const ICO = at('../../scripts/agent/jobscout-agent.ico')

describe('the icon file', () => {
  it('is committed, so a release never waits on somebody running a script', () => {
    expect(existsSync(ICO)).toBe(true)
  })

  it('is a real multi-size ICO, not a renamed png', () => {
    const b = readFileSync(ICO)
    expect(b.readUInt16LE(0)).toBe(0)        // reserved
    expect(b.readUInt16LE(2)).toBe(1)        // type 1 = icon
    const count = b.readUInt16LE(4)
    expect(count).toBeGreaterThanOrEqual(5)

    const sizes = []
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 16
      sizes.push(b.readUInt8(o) || 256)      // 0 means 256 — it is a one-byte field
      const len = b.readUInt32LE(o + 8)
      const off = b.readUInt32LE(o + 12)
      expect(off + len).toBeLessThanOrEqual(b.length)
      // Every entry is a PNG, which ICO has allowed since Vista.
      expect(b.subarray(off, off + 4).toString('hex')).toBe('89504e47')
    }
    // The sizes Windows actually asks for: title bar, taskbar, Explorer, Alt-Tab.
    for (const want of [16, 32, 48, 256]) expect(sizes, String(want)).toContain(want)
  })
})

describe('how it gets there', () => {
  const maker = read('../../scripts/make-agent-icon.mjs')
  const builder = read('../../scripts/build-agent-release.mjs')

  it('the build passes it to deno compile', () => {
    expect(builder).toMatch(/'--icon', 'scripts\/agent\/jobscout-agent\.ico'/)
  })

  it('and still builds if the file is missing, rather than failing the release', () => {
    expect(builder).toMatch(/existsSync\('scripts\/agent\/jobscout-agent\.ico'\)/)
  })

  it('the PNGs are forced to RGBA', () => {
    // deno compile --icon refuses anything else outright — "The PNG is not in
    // RGBA format" — and sharp drops the alpha channel on an opaque source to
    // save bytes. Found by compiling it, not by reading the docs.
    expect(maker).toMatch(/\.ensureAlpha\(\)/)
  })

  it('crops rather than squashes, because these are photographs', () => {
    expect(maker).toMatch(/fit: 'cover'/)
  })
})
