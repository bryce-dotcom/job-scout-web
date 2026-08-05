import { describe, it, expect } from 'vitest'
import {
  lineAsset, withLineAssets, withAssets, hasProductImage,
  CUSTOMER_SAFE_ASSET_KEYS, BRAND_IDENTIFYING_KEYS,
} from './productAssets'

// Shape the portal and the estimate query actually return.
const joinedLine = {
  id: 1, description: 'Highbay',
  item: {
    id: 1374, name: 'SMBE 110W Highbay', image_url: 'https://x/p.png',
    product_category: 'Highbay', manufacturer: 'MES',
    model_number: 'MES-PHB-SSRP-110WB1ML1A1-abW50', dlc_listing_number: 'PXXXXX',
  },
}

describe('reading an asset off a line', () => {
  it('finds it on the joined product', () => {
    expect(lineAsset(joinedLine, 'image_url')).toBe('https://x/p.png')
  })

  it('finds it when the line was already flattened', () => {
    expect(lineAsset({ image_url: 'https://y/q.png' }, 'image_url')).toBe('https://y/q.png')
  })

  it('returns null rather than undefined when absent', () => {
    expect(lineAsset({ id: 2 }, 'image_url')).toBeNull()
    expect(lineAsset(null, 'image_url')).toBeNull()
    expect(lineAsset(joinedLine, null)).toBeNull()
  })
})

describe('flattening for a customer surface', () => {
  const out = withLineAssets(joinedLine)

  it('brings the photo up to the line where the renderer looks', () => {
    expect(out.image_url).toBe('https://x/p.png')
    expect(out.product_category).toBe('Highbay')
  })

  it('NEVER carries the manufacturer, model or DLC number', () => {
    // The portal payload is readable in devtools. model_number embeds the
    // maker code and a DLC number is a public lookup — either one lets the
    // customer re-bid the job elsewhere, which is the whole point of this work.
    for (const key of BRAND_IDENTIFYING_KEYS) expect(out[key]).toBeUndefined()
  })

  it('keeps everything else on the line untouched', () => {
    expect(out.id).toBe(1)
    expect(out.description).toBe('Highbay')
  })

  it('does not let a product default overwrite a line-level override', () => {
    const overridden = withLineAssets({ ...joinedLine, image_url: 'https://override/o.png' })
    expect(overridden.image_url).toBe('https://override/o.png')
  })
})

describe('flattening for an internal surface', () => {
  it('includes brand fields only when explicitly asked', () => {
    const internal = withLineAssets(joinedLine, { includeBrand: true })
    expect(internal.manufacturer).toBe('MES')
    expect(internal.model_number).toBe('MES-PHB-SSRP-110WB1ML1A1-abW50')
  })
})

describe('deciding whether to render a photo', () => {
  it('rejects the empty string a cleared upload leaves behind', () => {
    // Rendering '' puts a broken image on a customer's proposal.
    expect(hasProductImage({ item: { image_url: '' } })).toBe(false)
    expect(hasProductImage({ item: { image_url: '   ' } })).toBe(false)
    expect(hasProductImage({ item: { image_url: null } })).toBe(false)
    expect(hasProductImage(joinedLine)).toBe(true)
  })
})

describe('junk', () => {
  it('survives it', () => {
    expect(withAssets(null)).toEqual([])
    expect(withAssets(undefined)).toEqual([])
    expect(withLineAssets(null)).toBeNull()
    expect(withAssets([joinedLine]).length).toBe(1)
  })

  it('keeps the allow-list and deny-list disjoint', () => {
    for (const k of CUSTOMER_SAFE_ASSET_KEYS) expect(BRAND_IDENTIFYING_KEYS).not.toContain(k)
  })
})
