import { describe, it, expect } from 'vitest'
import { storagePathFromUrl } from './employeePhoto.js'

describe('pulling the storage path out of a headshot url', () => {
  const base = 'https://tzrhfhisdeahrrmeksif.supabase.co/storage/v1/object'

  it('handles the public shape every row actually has', () => {
    expect(storagePathFromUrl(`${base}/public/employee-photos/3/1773328317321.png`))
      .toBe('3/1773328317321.png')
  })

  it('handles a signed url, query string and all', () => {
    expect(storagePathFromUrl(`${base}/sign/employee-photos/3/x.png?token=abc.def`))
      .toBe('3/x.png')
  })

  it('handles the authenticated shape', () => {
    expect(storagePathFromUrl(`${base}/authenticated/employee-photos/9/y.jpg`)).toBe('9/y.jpg')
  })

  it('decodes an encoded path', () => {
    expect(storagePathFromUrl(`${base}/public/employee-photos/3/my%20photo.png`))
      .toBe('3/my photo.png')
  })

  it('returns null for anything that is not this bucket', () => {
    expect(storagePathFromUrl(`${base}/public/company-logos/3/logo.png`)).toBe(null)
    expect(storagePathFromUrl('https://example.com/pic.png')).toBe(null)
    expect(storagePathFromUrl('')).toBe(null)
    expect(storagePathFromUrl(null)).toBe(null)
  })
})
