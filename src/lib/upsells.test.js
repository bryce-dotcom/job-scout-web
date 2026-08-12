import { describe, it, expect } from 'vitest'
import { normalizeUpsells, resolveUpsells, buildTiers, DEFAULT_UPSELLS } from './upsells'

describe('reading the catalogue', () => {
  it('accepts plain strings, because Arnie stores simple lists that way', () => {
    // Forcing a shape on the way in would make the conversational path fail
    // invisibly — Arnie adds "Commissioning" and nothing appears.
    expect(normalizeUpsells(['Commissioning'])).toEqual([
      { name: 'Commissioning', tier: 'better', price: 0, price_type: 'flat', description: '', active: true },
    ])
  })

  it('keeps a real price and tier', () => {
    const [u] = normalizeUpsells([{ name: 'Remote Monitoring', tier: 'best', price: 1200 }])
    expect(u.price).toBe(1200)
    expect(u.tier).toBe('best')
  })

  it('drops junk instead of rendering it', () => {
    expect(normalizeUpsells([null, '', { name: '  ' }, 5])).toEqual([])
    expect(normalizeUpsells(null)).toEqual([])
  })

  it('falls back to what used to be hardcoded when nothing is configured', () => {
    expect(resolveUpsells({}).length).toBe(DEFAULT_UPSELLS.length)
    expect(resolveUpsells({ upsells: [] }).length).toBe(DEFAULT_UPSELLS.length)
  })

  it('an unknown tier lands in better rather than vanishing', () => {
    expect(normalizeUpsells([{ name: 'X', tier: 'platinum' }])[0].tier).toBe('better')
  })
})

describe('tier prices ADD UP', () => {
  // The prompt used to say `<good price + warranty & value-add cost>` — the
  // model invented the package prices. A number nobody in the company set,
  // on the document a customer chooses from.
  const settings = {
    upsells: [
      { name: 'Warranty', tier: 'better', price: 500 },
      { name: 'Recycling', tier: 'better', price: 250 },
      { name: 'Monitoring', tier: 'best', price: 1000 },
    ],
  }

  it('good is the estimate as quoted', () => {
    expect(buildTiers({ basePrice: 10000, settings })[0].price).toBe(10000)
  })

  it('better adds its own items', () => {
    expect(buildTiers({ basePrice: 10000, settings })[1].price).toBe(10750)
  })

  it('best builds on better, not on good', () => {
    expect(buildTiers({ basePrice: 10000, settings })[2].price).toBe(11750)
  })

  it('applies the SAME incentive to every tier', () => {
    // The incentive is the utility's, not a discount that scales with package.
    const t = buildTiers({ basePrice: 10000, incentive: 4000, settings })
    expect(t.map(x => x.price - x.net_price)).toEqual([4000, 4000, 4000])
  })

  it('never shows a negative net price', () => {
    expect(buildTiers({ basePrice: 1000, incentive: 5000, settings })[0].net_price).toBe(0)
  })
})

describe('items priced at zero', () => {
  // Cole's list is mostly £0 add-ons — things we already do, named so the
  // customer sees the value. "Included" is a legitimate upsell.
  const settings = {
    upsells: [
      { name: 'Energy Saving Projection Report', tier: 'better', price: 0 },
      { name: 'Commissioning', tier: 'better', price: 0 },
    ],
  }

  it('still appear in the package', () => {
    expect(buildTiers({ basePrice: 8000, settings })[1].features)
      .toEqual(['Energy Saving Projection Report', 'Commissioning'])
  })

  it('do not change the price', () => {
    expect(buildTiers({ basePrice: 8000, settings })[1].price).toBe(8000)
  })
})

describe('an inactive item', () => {
  it('is kept in the catalogue but left out of the packages', () => {
    const settings = { upsells: [{ name: 'Old thing', tier: 'better', active: false }] }
    expect(resolveUpsells(settings)).toHaveLength(1)
    expect(buildTiers({ basePrice: 100, settings })[1].features).toEqual([])
  })
})

describe('percentage-priced upsells', () => {
  // Bryce: the warranty should be a percentage of the total project. A warranty
  // at 5% of a $200k job is a different product from 5% of an $8k job, which is
  // what "adjust according to project size" means.
  const settings = {
    upsells: [
      { name: 'Extended Warranty', tier: 'better', price: 5, price_type: 'percent' },
      { name: 'Commissioning', tier: 'better', price: 0 },
      { name: 'Remote Monitoring', tier: 'best', price: 10, price_type: 'percent' },
    ],
  }

  it('scales with the project', () => {
    expect(buildTiers({ basePrice: 8000, settings })[1].price).toBe(8400)     // +5%
    expect(buildTiers({ basePrice: 200000, settings })[1].price).toBe(210000) // +5%
  })

  it('takes the percentage off the BASE, not the running package total', () => {
    // Otherwise the 10% Best item would silently charge 10% of the warranty
    // too, and the same item would cost different amounts depending on the
    // order the catalogue happened to be in.
    const [, , best] = buildTiers({ basePrice: 10000, settings })
    expect(best.price).toBe(11500)   // 10,000 + 500 (5%) + 1,000 (10% of base)
  })

  it('reports what each item actually came to', () => {
    const [, better] = buildTiers({ basePrice: 20000, settings })
    expect(better.items.find(i => i.name === 'Extended Warranty').amount).toBe(1000)
  })

  it('mixes flat and percentage in one package', () => {
    const mixed = { upsells: [
      { name: 'Pct', tier: 'better', price: 10, price_type: 'percent' },
      { name: 'Flat', tier: 'better', price: 250 },
    ] }
    expect(buildTiers({ basePrice: 1000, settings: mixed })[1].price).toBe(1350)
  })
})
