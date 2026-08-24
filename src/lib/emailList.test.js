import { describe, it, expect } from 'vitest'
import { parseEmailList, emailListIsClean } from '../../supabase/functions/_shared/emailList.ts'

describe('people type address lists the way they talk', () => {
  it('splits on commas, semicolons and newlines', () => {
    expect(parseEmailList('a@x.com, b@x.com; c@x.com\nd@x.com').valid)
      .toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'])
  })

  it('takes the address out of a Name <addr> form', () => {
    expect(parseEmailList('Becky Jones <Becky@MtnPM.com>').valid).toEqual(['becky@mtnpm.com'])
  })

  it('ignores spacing and case', () => {
    expect(parseEmailList('  A@X.com ,, b@x.com  ').valid).toEqual(['a@x.com', 'b@x.com'])
  })

  it('treats an empty box as an empty list, not an error', () => {
    for (const v of ['', null, undefined, '   ', ',,;']) {
      expect(parseEmailList(v).valid).toEqual([])
      expect(emailListIsClean(v)).toBe(true)
    }
  })
})

describe('nobody gets two copies', () => {
  it('drops a duplicate typed twice', () => {
    expect(parseEmailList('a@x.com, A@X.com').valid).toEqual(['a@x.com'])
  })

  it('drops anyone already on the To line', () => {
    expect(parseEmailList('becky@mtnpm.com, boss@mtnpm.com', { exclude: 'Becky@MtnPM.com' }).valid)
      .toEqual(['boss@mtnpm.com'])
  })
})

// One fat-fingered address must not stop the invoice reaching the other three.
describe('a bad address is reported, not swallowed, and does not block the rest', () => {
  it('separates the good from the bad', () => {
    const got = parseEmailList('good@x.com, not-an-email, also@x.com')
    expect(got.valid).toEqual(['good@x.com', 'also@x.com'])
    expect(got.invalid).toEqual(['not-an-email'])
  })

  it('rejects the near-misses that look right', () => {
    expect(parseEmailList('a@x, b@.com, @x.com, c@x.c').invalid).toHaveLength(4)
  })

  it('emailListIsClean is how the screen decides whether to warn', () => {
    expect(emailListIsClean('a@x.com, b@x.com')).toBe(true)
    expect(emailListIsClean('a@x.com, oops')).toBe(false)
  })
})

describe('a cap, so a paste cannot mail a thousand people', () => {
  it('keeps the first ten', () => {
    const many = Array.from({ length: 30 }, (_, i) => `p${i}@x.com`).join(',')
    expect(parseEmailList(many).valid).toHaveLength(10)
  })

  it('honours a smaller cap', () => {
    expect(parseEmailList('a@x.com,b@x.com,c@x.com', { max: 2 }).valid).toHaveLength(2)
  })
})
