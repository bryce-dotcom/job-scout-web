// audit-photos is private (Bryce, 2026-10-20). Every reader opens a signed
// link; the stored public-URL values are addresses, not working links.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const signCalls = []
vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: (bucket) => ({
        createSignedUrls: async (paths, expires) => {
          signCalls.push({ bucket, paths, expires })
          return { data: paths.map((p) => ({ path: p, signedUrl: `https://x/storage/v1/object/sign/${bucket}/${p}?token=t` })) }
        },
      }),
    },
  },
}))

const { storageRef, needsSigning, signedUrlFor } = await import('./storageUrl.jsx')
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const PUB = 'https://tz.supabase.co/storage/v1/object/public/audit-photos/audits/104/photo_0.jpg'

describe('reading a stored link', () => {
  it('finds the bucket and path in a public, authenticated or signed URL, or a bare path', () => {
    expect(storageRef(PUB)).toEqual({ bucket: 'audit-photos', path: 'audits/104/photo_0.jpg' })
    expect(storageRef('https://tz.supabase.co/storage/v1/object/authenticated/project-documents/jobs/1/a%20b.pdf')).toEqual({ bucket: 'project-documents', path: 'jobs/1/a b.pdf' })
    expect(storageRef('audits/9/customer_signature.png', 'audit-photos')).toEqual({ bucket: 'audit-photos', path: 'audits/9/customer_signature.png' })
    expect(storageRef('blob:http://x/1')).toBeNull()
  })
  it('signs only private buckets, and never re-signs a signed link', () => {
    expect(needsSigning(PUB)).toBe(true)
    expect(needsSigning('https://tz.supabase.co/storage/v1/object/public/product-images/3/a.png')).toBe(false)
    expect(needsSigning('https://tz.supabase.co/storage/v1/object/sign/audit-photos/a.jpg?token=x')).toBe(false)
    expect(needsSigning('data:image/png;base64,AAA')).toBe(false)
  })
  it('batches the links asked for together into one request and caches them', async () => {
    signCalls.length = 0
    const [a, b] = await Promise.all([signedUrlFor(PUB), signedUrlFor(PUB.replace('photo_0', 'photo_1'))])
    expect(a).toMatch(/\/object\/sign\/audit-photos\/audits\/104\/photo_0\.jpg\?token=/)
    expect(b).toMatch(/photo_1\.jpg\?token=/)
    expect(signCalls).toHaveLength(1)
    expect(signCalls[0].paths).toEqual(['audits/104/photo_0.jpg', 'audits/104/photo_1.jpg'])
    await signedUrlFor(PUB)
    expect(signCalls).toHaveLength(1)
  })
  it('passes a public-bucket link straight through', async () => {
    const logo = 'https://tz.supabase.co/storage/v1/object/public/company-logos/3/logo.png'
    expect(await signedUrlFor(logo)).toBe(logo)
  })
})

describe('every reader opens a signed link', () => {
  it('the bucket is private', () => {
    expect(read('supabase/migrations/20261020160000_audit_photos_private.sql')).toMatch(/update storage\.buckets set public = false where id = 'audit-photos';/)
  })
  it.each([
    ['src/pages/EstimateDetail.jsx', 5],
    ['src/pages/JobDetail.jsx', 5],
    ['src/pages/LeadDetail.jsx', 2],
    ['src/pages/FieldScout.jsx', 2],
  ])('%s shows stored photos through SignedImg', (file, n) => {
    const s = read(file)
    expect((s.match(/<SignedImg/g) || []).length).toBe(n)
    expect(s).toMatch(/import \{ SignedImg[^}]*\} from '\.\.\/lib\/storageUrl'/)
  })
  it('the survey photos open the signed link they already show', () => {
    const s = read('src/pages/FieldScout.jsx')
    expect(s).not.toMatch(/window\.open\(src, '_blank'/)
    expect((s.match(/window\.open\(e\.currentTarget\.src, '_blank', 'noopener'\)/g) || []).length).toBe(2)
  })
  it('JobDetail signs its audit gallery at load, and the submittal export signs what it downloads', () => {
    const s = read('src/pages/JobDetail.jsx')
    expect(s).toMatch(/from\('audit-photos'\)\.createSignedUrls\(names\.map/)
    expect(s).not.toMatch(/from\('audit-photos'\)\.getPublicUrl/)
    expect((s.match(/await fetch\(\(await signedUrlFor\(item\.url\)\) \|\| item\.url\)/g) || []).length).toBe(3)
  })
  it('the document generator signs the legacy signature', () => {
    expect(read('src/lib/documentGenerator.js')).toMatch(/from\('audit-photos'\)\.createSignedUrl\(audit\.customer_signature, 600\)/)
  })
  it('Lenard\'s public pages use the links lenard-projects signs', () => {
    expect(read('supabase/functions/lenard-projects/index.ts')).toMatch(/storage\/v1\/object\/sign\/audit-photos/)
    for (const f of ['src/pages/agents/LenardAZSRP.jsx', 'src/pages/agents/LenardUTRMP.jsx']) {
      const s = read(f)
      expect(s).toMatch(/fetch\(project\.audit\.signedUrls\?\.\[project\.audit\.customer_signature\] \|\|/)
      expect(s).toMatch(/fetch\(project\.audit\.signedUrls\?\.\[path\] \|\|/)
    }
  })
})

describe('staff headshots are private too', () => {
  it('the bucket is private and the helper signs it', () => {
    expect(read('supabase/migrations/20261020180000_employee_photos_private.sql')).toMatch(/update storage\.buckets set public = false where id = 'employee-photos';/)
    expect(needsSigning('https://tz.supabase.co/storage/v1/object/public/employee-photos/3/1773176125475.png')).toBe(true)
  })
  it.each([
    ['src/pages/Employees.jsx', 2], ['src/pages/Payroll.jsx', 3], ['src/pages/CompanyMap.jsx', 1], ['src/components/WhosWorking.jsx', 1],
  ])('%s shows headshots through SignedImg', (file, n) => {
    expect((read(file).match(/<SignedImg/g) || []).length).toBe(n)
  })
  it('the live map signs its markers when it loads (the pop-up is plain HTML)', () => {
    expect(read('src/components/WhosWorking.jsx')).toMatch(/headshot: p\.headshot \? await signedUrlFor\(p\.headshot\) : null/)
  })
})
