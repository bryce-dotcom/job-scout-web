import { describe, it, expect } from 'vitest'
import { isReadOnlyGate, isPermissionError, friendlyWriteError, writeErrorMessage } from './writeGate'

// The exact string Antonio's tester was shown.
const ANTONIO = {
  code: '42501',
  message: 'new row violates row-level security policy "require_writable_ins" for table "feedback"',
}

describe('the error a locked-out account actually gets', () => {
  it('recognises the trial gate', () => {
    expect(isReadOnlyGate(ANTONIO)).toBe(true)
  })

  it('explains the trial instead of naming a policy', () => {
    const msg = writeErrorMessage(ANTONIO)
    expect(msg).toMatch(/trial has ended/i)
    expect(msg).toMatch(/read-only/i)
    expect(msg).not.toMatch(/require_writable|row-level|policy|feedback/i)
  })

  it('says the data is still there — that is the actual worry', () => {
    expect(writeErrorMessage(ANTONIO)).toMatch(/still here/i)
  })

  it('still catches it if the policy gets renamed', () => {
    expect(isReadOnlyGate({ code: '42501', message: 'new row violates row-level security policy "x" for table "jobs"' }))
      .toBe(true)
  })
})

describe('a real permission problem is not blamed on billing', () => {
  const denied = { code: '42501', message: 'permission denied for table payroll_runs' }

  it('is not treated as the gate', () => {
    expect(isReadOnlyGate(denied)).toBe(false)
    expect(isPermissionError(denied)).toBe(true)
  })

  it('points at access, not renewal', () => {
    const msg = writeErrorMessage(denied)
    expect(msg).toMatch(/access/i)
    expect(msg).not.toMatch(/trial/i)
  })
})

describe('the shape call sites actually pass', () => {
  // Hundreds of places do toast.error('Failed to save: ' + err.message), so the
  // gate arrives as one concatenated string, not an error object.
  it('translates a concatenated string', () => {
    const asToastSees = 'Failed to save job: ' + ANTONIO.message
    expect(isReadOnlyGate(asToastSees)).toBe(true)
    expect(friendlyWriteError(asToastSees)).toMatch(/trial has ended/i)
  })

  it('leaves an ordinary toast string alone', () => {
    expect(friendlyWriteError('Please enter a customer name')).toBe(null)
    expect(friendlyWriteError('Failed to save job: network request failed')).toBe(null)
  })
})

describe('ordinary errors are left alone', () => {
  it('never swallows a real message', () => {
    expect(friendlyWriteError({ message: 'duplicate key value violates unique constraint' })).toBe(null)
    expect(writeErrorMessage({ message: 'duplicate key value violates unique constraint' }))
      .toContain('duplicate key')
  })

  it('keeps the caller prefix for ordinary errors', () => {
    expect(writeErrorMessage({ message: 'network down' }, 'Error saving: '))
      .toBe('Error saving: network down')
  })

  it('drops the prefix for the gate, which is a sentence of its own', () => {
    expect(writeErrorMessage(ANTONIO, 'Error submitting feedback: ')).not.toMatch(/^Error submitting/)
  })

  it('survives a bare string or a missing message', () => {
    expect(() => writeErrorMessage('boom')).not.toThrow()
    expect(writeErrorMessage({})).toBe('Something went wrong.')
  })
})
