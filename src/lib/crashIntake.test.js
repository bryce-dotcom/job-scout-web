import { describe, it, expect } from 'vitest'
import { isDevReport } from '../../supabase/functions/_shared/crashIntake.ts'

// Nine "Failed to update a ServiceWorker for scope ('http://localhost:5190/')"
// reports reached the crash table from a local preview built off an older
// branch, 2026-09-15..17 — alerted on and ticketed as though a rep hit them.

describe('the crash intake refuses reports from a developer machine', () => {
  it('by the request origin', () => {
    expect(isDevReport({ origin: 'http://localhost:5190', message: 'x' })).toBe(true)
    expect(isDevReport({ origin: 'http://127.0.0.1:5173', message: 'x' })).toBe(true)
    expect(isDevReport({ origin: 'http://app.localhost:3000', message: 'x' })).toBe(true)
    expect(isDevReport({ origin: 'http://macbook.local:5173', message: 'x' })).toBe(true)
    expect(isDevReport({ origin: null, referer: 'http://localhost:5190/books', message: 'x' })).toBe(true)
  })

  it('by a localhost URL inside the crash text, whatever the origin header says', () => {
    expect(isDevReport({ origin: null, message: "Failed to update a ServiceWorker for scope ('http://localhost:5190/') with script ('http://localhost:5190/sw.js')" })).toBe(true)
    expect(isDevReport({ origin: null, message: 'boom', stack: 'TypeError: boom at fn (http://localhost:5173/src/x.js:1:1)' })).toBe(true)
  })

  it('and lets every production report through', () => {
    expect(isDevReport({ origin: 'https://jobscout.appsannex.com', message: "Cannot read properties of undefined (reading 'default')", stack: 'at H (https://jobscout.appsannex.com/assets/x.js:1:1)' })).toBe(false)
    expect(isDevReport({ origin: null, referer: null, message: 'Something local-ish but not a URL: localhost mentioned' })).toBe(false)
    expect(isDevReport({ origin: 'https://localhost.example.com', message: 'x' })).toBe(false)
  })
})
