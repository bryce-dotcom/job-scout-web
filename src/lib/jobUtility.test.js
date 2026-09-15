import { describe, it, expect } from 'vitest'
import { resolveJobUtility, defaultUtilityProviderId, providerById, DEFAULT_UTILITY_SETTING } from './jobUtility'

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
