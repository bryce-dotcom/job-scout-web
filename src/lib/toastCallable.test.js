import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { toast } from './toast'

// `toast` is an OBJECT — toast.success / .error / .info / .warning /
// .announcement. It is not callable. So `toast('saved')` throws
//
//     TypeError: toast is not a function
//
// which in a production bundle reads "PT is not a function" and tells
// nobody anything.
//
// 20 Oct 2026, mid payroll run. Alayda released a bonus, typed her reason,
// and got exactly that. The release had ALREADY been written — the three
// bare calls were all in notifyHrOfOverride, which runs after the update —
// so the bonus came back verified while the screen showed an error. She had
// no way to tell whether it had worked. Bryce: "it gave her some sort of
// error then she clicked out and it verified it. FUCKing clunky."
//
// The catch block made it worse: it called toast() again to report the
// failure, so the handler threw a second time on its way out.
//
// Nothing in a unit test reaches that line, so this greps for it instead.

const SRC = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { yield* sourceFiles(full); continue }
    if (/\.(jsx?|tsx?)$/.test(entry) && !/\.test\./.test(entry)) yield full
  }
}

describe('toast is an object, and nobody may call it like a function', () => {
  it('is not callable, which is the whole trap', () => {
    expect(typeof toast).toBe('object')
    expect(typeof toast).not.toBe('function')
    for (const m of ['success', 'error', 'info', 'warning', 'announcement']) {
      expect(typeof toast[m], m).toBe('function')
    }
  })

  it('no source file calls toast(...) directly', () => {
    // A bare call: `toast(` with no dot in front and not part of a longer
    // identifier (addToast, removeToast, a `toast` parameter name).
    const bare = /(^|[^.\w$])toast\s*\(/
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (!/from ['"][^'"]*\/toast['"]/.test(text) && !/from ['"]\.\/toast['"]/.test(text)) continue
      text.split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        if (!bare.test(code)) return
        if (/\b(function|const|let|var)\s+toast\s*\(/.test(code)) return
        if (/addToast|removeToast/.test(code)) return
        offenders.push(`${file.split(/[\\/]/).slice(-2).join('/')}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders, `toast() is not callable — use toast.success / .error / .info / .warning:\n${offenders.join('\n')}`).toEqual([])
  })
})
