// "When we send emails from the system we cant add notes or descriptions in
// the email it will only send the quote" (Cole, 2026-10-15).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const page = read('../pages/EstimateDetail.jsx')
const fn = read('../../supabase/functions/send-estimate/index.ts')

describe('a quote email can carry the rep\'s own message', () => {
  it('the send window has a Message box, sent as custom_message and cleared after', () => {
    expect(page).toMatch(/<label style=\{labelStyle\}>Message <span/)
    expect(page).toMatch(/value=\{sendMessage\} onChange=\{\(e\) => setSendMessage\(e\.target\.value\)\}/)
    expect(page).toMatch(/custom_message: sendMessage\.trim\(\) \|\| undefined,/)
    expect(page).toMatch(/setSendSubject\(''\)\n\s+setSendMessage\(''\)/)
  })
  it('the email puts it after the greeting, escaped, line breaks kept', () => {
    expect(fn).toMatch(/custom_message,/)
    expect(fn).toMatch(/const personalMessage = String\(custom_message \|\| ''\)\.trim\(\)\.slice\(0, 4000\)\n\s+\.replace\(\/&\/g, '&amp;'\)\.replace\(\/<\/g, '&lt;'\)/)
    const greet = fn.indexOf('>${greeting}</p>')
    expect(fn.indexOf('${personalMessage ?', greet)).toBeGreaterThan(greet)
    expect(fn.indexOf('${personalMessage ?', greet)).toBeLessThan(fn.indexOf('>${introCopy}</p>'))
    expect(fn).toMatch(/white-space:pre-wrap;">\$\{personalMessage\}/)
  })
  it('the copy kept on the estimate\'s thread leads with the message too', () => {
    expect(page).toMatch(/\.\.\.\(sendMessage\.trim\(\) \? \[sendMessage\.trim\(\), ''\] : \[\]\),\n\s+`Sent to: \$\{sendEmail\}`/)
  })
})
