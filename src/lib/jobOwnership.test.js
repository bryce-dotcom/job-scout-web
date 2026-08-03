import { describe, it, expect } from 'vitest'
import {
  buildLeadIndex, leadForJob, ownerIdsForJob, jobOwnedBy, primaryOwnerId, isUnattributed,
} from './jobOwnership'

// The bug this file exists to prevent: jobs.lead_id is TEXT, leads.id is INT.
// Every test that mixes the two on purpose is guarding a real incident.

const LEADS = [
  { id: 1679, salesperson_id: 17, lead_owner_id: 17, salesperson_ids: [17] },
  { id: 2000, salesperson_id: null, lead_owner_id: 42, salesperson_ids: null },
  { id: 3000, salesperson_id: null, lead_owner_id: null, salesperson_ids: [8, 9] },
]
const idx = buildLeadIndex(LEADS)

describe('the TEXT / INT lead_id trap', () => {
  it('resolves a job whose lead_id is a STRING against numeric lead ids', () => {
    // Job 8739 "Anchor 3PL", $82,431 — read as unattributed for months.
    expect(leadForJob({ lead_id: '1679' }, idx)).toBeTruthy()
  })

  it('resolves a numeric lead_id just as well', () => {
    expect(leadForJob({ lead_id: 1679 }, idx)).toBeTruthy()
  })

  it('matches an employee id regardless of which side is a string', () => {
    expect(jobOwnedBy({ lead_id: '1679' }, 17, idx)).toBe(true)
    expect(jobOwnedBy({ lead_id: 1679 }, '17', idx)).toBe(true)
    expect(jobOwnedBy({ salesperson_id: '17' }, 17, idx)).toBe(true)
  })

  it('returns null for a lead that genuinely is not there', () => {
    expect(leadForJob({ lead_id: '99999' }, idx)).toBeNull()
    expect(leadForJob({ lead_id: null }, idx)).toBeNull()
    expect(leadForJob(null, idx)).toBeNull()
  })
})

describe('who gets CREDIT for the sale', () => {
  it('credits the job salesperson when there is one', () => {
    expect(primaryOwnerId({ salesperson_id: 5, lead_id: '1679' }, idx)).toBe('5')
  })

  it('falls back to the lead salesperson when the job has none', () => {
    // This single rule recovers $232,049 of 2026 work.
    expect(primaryOwnerId({ salesperson_id: null, lead_id: '1679' }, idx)).toBe('17')
  })

  it('falls back to the first of salesperson_ids', () => {
    expect(primaryOwnerId({ lead_id: '3000' }, idx)).toBe('8')
  })

  it('does NOT credit the lead owner — they may be a setter, not the closer', () => {
    // Lead 2000 has only a lead_owner_id. Crediting them would pay
    // commission to whoever owned the lead.
    expect(primaryOwnerId({ lead_id: '2000' }, idx)).toBeNull()
    expect(ownerIdsForJob({ lead_id: '2000' }, idx, 'credit').has('42')).toBe(false)
  })

  it('reports genuinely unattributed work as such', () => {
    expect(isUnattributed({ lead_id: '2000' }, idx)).toBe(true)
    expect(isUnattributed({ lead_id: null }, idx)).toBe(true)
    expect(isUnattributed({ lead_id: '1679' }, idx)).toBe(false)
  })
})

describe('who gets to SEE it', () => {
  it('visibility DOES include the lead owner', () => {
    expect(ownerIdsForJob({ lead_id: '2000' }, idx, 'visibility').has('42')).toBe(true)
    expect(jobOwnedBy({ lead_id: '2000' }, 42, idx, 'visibility')).toBe(true)
  })

  it('credit stays narrower than visibility', () => {
    const credit = ownerIdsForJob({ lead_id: '2000' }, idx, 'credit')
    const vis = ownerIdsForJob({ lead_id: '2000' }, idx, 'visibility')
    expect(vis.size).toBeGreaterThan(credit.size)
    for (const id of credit) expect(vis.has(id)).toBe(true)
  })

  it('defaults to credit, the safer of the two', () => {
    expect(ownerIdsForJob({ lead_id: '2000' }, idx).has('42')).toBe(false)
  })
})

describe('multi-rep leads', () => {
  it('counts every rep listed on the lead', () => {
    const ids = ownerIdsForJob({ lead_id: '3000' }, idx)
    expect(ids.has('8')).toBe(true)
    expect(ids.has('9')).toBe(true)
  })

  it('a job salesperson and a lead salesperson can both attribute it', () => {
    const ids = ownerIdsForJob({ salesperson_id: 5, lead_id: '1679' }, idx)
    expect(ids.has('5')).toBe(true)
    expect(ids.has('17')).toBe(true)
  })
})

describe('junk input', () => {
  it('builds an index from nothing without throwing', () => {
    expect(buildLeadIndex().size).toBe(0)
    expect(buildLeadIndex(null).size).toBe(0)
    expect(buildLeadIndex([null, undefined]).size).toBe(0)
  })

  it('never claims a null employee owns something', () => {
    expect(jobOwnedBy({ salesperson_id: 5 }, null, idx)).toBe(false)
    expect(jobOwnedBy({ salesperson_id: null }, null, idx)).toBe(false)
  })

  it('handles a missing index', () => {
    expect(() => ownerIdsForJob({ lead_id: '1679' }, null)).not.toThrow()
    expect(primaryOwnerId({ salesperson_id: 7 }, null)).toBe('7')
  })
})
