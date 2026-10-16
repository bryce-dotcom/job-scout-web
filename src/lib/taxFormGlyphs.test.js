import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// The tax-form and onboarding PDFs are drawn with pdf-lib's standard
// Helvetica, which can only encode WinAnsi. pdf-lib THROWS on any other
// glyph, and that kills the whole document, not one character: a "☑" on the
// 1096 cover meant the 1099-NEC set never generated once (found 2026-10-16).
// Every string literal on a drawing line must stay inside WinAnsi.

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const FILES = [
  'supabase/functions/render-tax-forms/index.ts',
  'supabase/functions/render-onboarding-pdfs/index.ts',
]
const WIN_EXTRA = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'].map(c => c.codePointAt(0)))
const encodable = (cp) => cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF) || WIN_EXTRA.has(cp)
const DRAWING = /\b(drawText|drawBox|drawKV|drawWrapped|drawLabel|drawField|drawRow|drawCell|drawHeader)\s*\(/

describe('PDF renderers draw only WinAnsi glyphs', () => {
  for (const file of FILES) {
    it(file, () => {
      const bad = []
      readFileSync(resolve(repo, file), 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        if (!DRAWING.test(code)) return
        for (const ch of code) if (!encodable(ch.codePointAt(0))) bad.push(`${i + 1}: ${ch} (U+${ch.codePointAt(0).toString(16)})`)
      })
      expect(bad).toEqual([])
    })
  }

  it('the check catches the glyph that broke the 1096', () => {
    expect(encodable('☑'.codePointAt(0))).toBe(false)
    expect(encodable('—'.codePointAt(0))).toBe(true)
    expect(encodable('•'.codePointAt(0))).toBe(true)
  })
})
