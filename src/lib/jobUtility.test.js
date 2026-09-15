import { describe, it, expect } from 'vitest'
import { resolveJobUtility, defaultUtilityProviderId, providerById, DEFAULT_UTILITY_SETTING, stateOfAddress, jobState, defaultAppliesTo } from './jobUtility'

const providers = [
  { id: 116, provider_name: 'Rocky Mountain Power' },
  { id: 117, provider_name: 'Logan City Light & Power' },
  { id: 128, provider_name: 'Salt River Project (SRP)' },
]
const dflt = [{ key: DEFAULT_UTILITY_SETTING, value: '116' }]

describe('the company default', () => {
  it('reads the bare id, and a JSON-quoted one from an older writer', () => {
    expect(defaultUtilityProviderId([{ key: DEFAULT_UTILITY_SETTING, value: '116' }])).toBe(116)
    expect(defaultUtilityProviderId([{ key: DEFAULT_UTILITY_SETTING, value: '"116"' }])).toBe(116)
    expect(defaultUtilityProviderId([{ key: DEFAULT_UTILITY_SETTING, value: 116 }])).toBe(116)
  })

  it('is nothing when unset, cleared, or junk', () => {
    expect(defaultUtilityProviderId([])).toBe(null)
    expect(defaultUtilityProviderId(null)).toBe(null)
    expect(defaultUtilityProviderId([{ key: DEFAULT_UTILITY_SETTING, value: '' }])).toBe(null)
    expect(defaultUtilityProviderId([{ key: DEFAULT_UTILITY_SETTING, value: null }])).toBe(null)
    expect(defaultUtilityProviderId([{ key: DEFAULT_UTILITY_SETTING, value: 'RMP' }])).toBe(null)
    expect(defaultUtilityProviderId([{ key: 'something_else', value: '116' }])).toBe(null)
  })

  it('providerById matches loosely on type and never on nothing', () => {
    expect(providerById(providers, '117')?.provider_name).toBe('Logan City Light & Power')
    expect(providerById(providers, 117)?.provider_name).toBe('Logan City Light & Power')
    expect(providerById(providers, null)).toBe(null)
    expect(providerById(providers, undefined)).toBe(null)
    expect(providerById(providers, 999)).toBe(null)
    expect(providerById(null, 116)).toBe(null)
  })
})

describe('which utility a job is with', () => {
  it('the job\'s own choice wins over the audit and the default', () => {
    const r = resolveJobUtility({ job: { utility_provider_id: 117 }, audit: { utility_provider_id: 116 }, providers, settings: dflt })
    expect(r).toEqual({ id: 117, name: 'Logan City Light & Power', source: 'job' })
  })

  it('then the audit that was walked — a company on two utilities gets the right one per job', () => {
    const r = resolveJobUtility({ job: { utility_provider_id: null }, audit: { utility_provider: { id: 128, provider_name: 'Salt River Project (SRP)' } }, providers, settings: dflt })
    expect(r).toEqual({ id: 128, name: 'Salt River Project (SRP)', source: 'audit' })
    // An audit whose provider is not in the store's list still names it.
    const r2 = resolveJobUtility({ job: {}, audit: { utility_provider: { id: 4000, provider_name: 'Some Co-op' } }, providers, settings: dflt })
    expect(r2).toEqual({ id: 4000, name: 'Some Co-op', source: 'audit' })
  })

  it('then the company default — the contractor who works one utility', () => {
    const r = resolveJobUtility({ job: { utility_provider_id: null }, audit: null, providers, settings: dflt })
    expect(r).toEqual({ id: 116, name: 'Rocky Mountain Power', source: 'default' })
  })

  it('and nothing at all when nobody has said', () => {
    expect(resolveJobUtility({ job: {}, audit: null, providers, settings: [] })).toEqual({ id: null, name: null, source: null })
    expect(resolveJobUtility()).toEqual({ id: null, name: null, source: null })
    // A default pointing at a provider that no longer exists names nothing.
    expect(resolveJobUtility({ job: {}, providers, settings: [{ key: DEFAULT_UTILITY_SETTING, value: '999' }] }).source).toBe(null)
  })

  it('a job provider that no longer exists falls through rather than naming a ghost', () => {
    const r = resolveJobUtility({ job: { utility_provider_id: 999 }, audit: null, providers, settings: dflt })
    expect(r.source).toBe('default')
  })
})

// ── the default must not cross state lines ────────────────────────────────
// HHH's default is Rocky Mountain Power (UT); the same company does SRP work
// in Arizona, and two Arizona records already said "Rocky Mountain Power".
describe('the state an address names', () => {
  it('reads addresses the way people type them', () => {
    expect(stateOfAddress('5026 E Main St Mesa, AZ 85205')).toBe('AZ')
    expect(stateOfAddress('3741 e main st ste 101 mesa az')).toBe('AZ')
    expect(stateOfAddress('2523 w houston ave 85120, AZ')).toBe('AZ')
    expect(stateOfAddress('1515 West Broadway, Mesa AZ')).toBe('AZ')
    expect(stateOfAddress('11325 E Apache Trail AJ AZ')).toBe('AZ')
    expect(stateOfAddress('7744 E Main St mesa Az')).toBe('AZ')
    expect(stateOfAddress('AZ')).toBe('AZ')
    expect(stateOfAddress('6395 W 10400 N, Highland, UT')).toBe('UT')
    expect(stateOfAddress('123 S Main St, Logan, UT 84321, USA')).toBe('UT')
    expect(stateOfAddress('418 E Broadway Rd, Phoenix, Arizona')).toBe('AZ')
    expect(stateOfAddress('Salt Lake City, Utah 84101')).toBe('UT')
  })

  it('says nothing rather than guessing', () => {
    expect(stateOfAddress('')).toBe(null)
    expect(stateOfAddress(null)).toBe(null)
    expect(stateOfAddress('1234 Industrial Pkwy')).toBe(null)
    expect(stateOfAddress('Building 7, Suite 200')).toBe(null)
  })

  it('a job is placed by its site address first, then its address', () => {
    expect(jobState({ job_address: 'Mesa, AZ 85205', address: 'Highland, UT' })).toBe('AZ')
    expect(jobState({ job_address: '', address: 'Highland, UT' })).toBe('UT')
    expect(jobState({})).toBe(null)
    expect(jobState(null)).toBe(null)
  })
})

describe('a Utah default says nothing about an Arizona job', () => {
  const rmp = { id: 116, provider_name: 'Rocky Mountain Power', state: 'UT' }
  const srp = { id: 128, provider_name: 'Salt River Project (SRP)', state: 'AZ' }
  const settings = [{ key: DEFAULT_UTILITY_SETTING, value: '116' }]

  it('applies at home, and where the job does not say', () => {
    expect(defaultAppliesTo(rmp, { job_address: 'Highland, UT 84003' })).toBe(true)
    expect(defaultAppliesTo(rmp, { job_address: '1234 Industrial Pkwy' })).toBe(true)
    expect(defaultAppliesTo({ id: 9, provider_name: 'Co-op' }, { job_address: 'Mesa, AZ' })).toBe(true) // provider with no state
  })

  it('does not apply across the line', () => {
    expect(defaultAppliesTo(rmp, { job_address: '5026 E Main St Mesa, AZ 85205' })).toBe(false)
    expect(resolveJobUtility({ job: { job_address: 'Mesa, AZ 85205' }, providers: [rmp, srp], settings })).toEqual({ id: null, name: null, source: null })
    expect(resolveJobUtility({ job: { job_address: 'Highland, UT' }, providers: [rmp, srp], settings }).source).toBe('default')
  })

  it('the job choice and the audit still win, in any state', () => {
    expect(resolveJobUtility({ job: { job_address: 'Mesa, AZ', utility_provider_id: 128 }, providers: [rmp, srp], settings }).name).toBe('Salt River Project (SRP)')
    expect(resolveJobUtility({ job: { job_address: 'Mesa, AZ' }, audit: { utility_provider_id: 128 }, providers: [rmp, srp], settings }).source).toBe('audit')
  })
})
