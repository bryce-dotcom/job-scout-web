import { describe, it, expect } from 'vitest'
import { utilityFormsForJob } from './jobUtility'

const providers = [
  { id: 1, provider_name: 'Rocky Mountain Power', state: 'UT' },
  { id: 2, provider_name: 'NV Energy', state: 'NV' },
  { id: 3, provider_name: 'Salt River Project', state: 'AZ' },
]
const forms = [
  { id: 10, provider_id: 1, form_name: 'wattsmart application' },
  { id: 11, provider_id: 2, form_name: 'Sure Bet application' },
  { id: 12, provider_id: 3, form_name: 'SRP application' },
]

describe('utilityFormsForJob', () => {
  it("offers only the job's utility's forms when the utility is known", () => {
    expect(utilityFormsForJob({ forms, utility: { id: 2, name: 'NV Energy' }, job: {}, providers }).map(f => f.id)).toEqual([11])
  })
  it('offers nothing when the utility is known but has no published form', () => {
    expect(utilityFormsForJob({ forms, utility: { id: 99 }, job: {}, providers })).toEqual([])
  })
  it("falls back to the job's state when no utility resolves", () => {
    const job = { job_address: '123 Main St, Las Vegas, NV 89101' }
    expect(utilityFormsForJob({ forms, utility: { id: null }, job, providers }).map(f => f.id)).toEqual([11])
  })
  it('falls back to every form when neither utility nor state is known', () => {
    expect(utilityFormsForJob({ forms, utility: null, job: { job_address: '' }, providers })).toHaveLength(3)
  })
  it('falls back to every form when the state has no provider with forms', () => {
    const job = { job_address: 'Boise, ID 83702' }
    expect(utilityFormsForJob({ forms, utility: null, job, providers })).toHaveLength(3)
  })
})
