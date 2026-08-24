import { describe, it, expect } from 'vitest'
import { productPricedPerLamp, orderQty, lampCount } from './lampQuantity'

describe('productPricedPerLamp', () => {
  // Real catalogue rows, company 3.
  const perLamp = [
    'MID 1L T8 4ft Per Lamp', 'MID 2L T5 4ft Per Lamp', 'MID 4L T8 4ft Per Lamp',
    'MID 2L UBend 2ft Per Lamp', 'MID 1L 8ft Lamp', 'MID 4L T5 4ft Lamp',
  ]
  const perFixture = [
    'SMBE 90/110/130/150/165W Highbay - 2ft LIFT',
    'SMBE  21/26/34/40W Linear Strip - 4ft Retrofit',
    'SMBE 55/65/75/90W Vapor Tight - 8ft',
    'SBE SUN 38W 4ft Strip Retrofit Kit',
    '4L Troffer 36W 4\' Retrofit Kit',
    'Troffer Retrofit Kit 24W/29W32W/39W w/lift',
  ]
  perLamp.forEach(n => it(`per lamp: ${n}`, () => expect(productPricedPerLamp(n)).toBe(true)))
  perFixture.forEach(n => it(`per fixture: ${n}`, () => expect(productPricedPerLamp(n)).toBe(false)))

  it('a 4L troffer KIT is one kit per troffer, not four', () => {
    // "4L" names the existing fixture; the kit is still sold per fixture.
    expect(productPricedPerLamp('4L Troffer 50W 4\' Retrofit Kit')).toBe(false)
  })
  it('lamp as hardware is not a pricing basis', () => {
    expect(productPricedPerLamp('Exterior Lamp Post')).toBe(false)
    expect(productPricedPerLamp('T8 Lamp Holder')).toBe(false)
  })
  it('accepts a product row or a bare name', () => {
    expect(productPricedPerLamp({ name: 'MID 4L T8 4ft Per Lamp' })).toBe(true)
    expect(productPricedPerLamp(null)).toBe(false)
    expect(productPricedPerLamp({})).toBe(false)
  })
})

describe('orderQty', () => {
  it('prices a fixture replacement per fixture, even under a 4-lamp existing', () => {
    // The Cocola line: 30 highbays, existing 4-lamp T5, SMBE highbay at $434.98.
    const line = { qty: 30, lampsPerFixture: 4, retrofitType: 'lamp', pricedPerLamp: false }
    expect(orderQty(line)).toBe(30)
    expect(orderQty(line) * 434.98).toBeCloseTo(13049.40, 2)
  })
  it('still multiplies when the product really is sold per lamp', () => {
    const line = { qty: 30, lampsPerFixture: 4, retrofitType: 'lamp', pricedPerLamp: true }
    expect(orderQty(line)).toBe(120)
  })
  it('fails safe when the flag is missing (old restored drafts)', () => {
    expect(orderQty({ qty: 30, lampsPerFixture: 4, retrofitType: 'lamp' })).toBe(30)
  })
  it('never multiplies a fixture retrofit', () => {
    expect(orderQty({ qty: 8, lampsPerFixture: 2, retrofitType: 'fixture', pricedPerLamp: true })).toBe(8)
  })
  it('single-lamp fixtures are unaffected', () => {
    expect(orderQty({ qty: 5, lampsPerFixture: 1, retrofitType: 'lamp', pricedPerLamp: true })).toBe(5)
  })
  it('handles empty lines', () => {
    expect(orderQty({})).toBe(0)
    expect(orderQty(null)).toBe(0)
  })

  it('reproduces the true Cocola project cost', () => {
    const lines = [
      { qty: 30, lampsPerFixture: 4, retrofitType: 'lamp', pricedPerLamp: false, price: 434.98 },
      { qty: 3, lampsPerFixture: 2, retrofitType: 'lamp', pricedPerLamp: false, price: 397.50 },
      { qty: 3, lampsPerFixture: 2, retrofitType: 'lamp', pricedPerLamp: false, price: 397.50 },
      { qty: 1, lampsPerFixture: 2, retrofitType: 'lamp', pricedPerLamp: false, price: 397.50 },
      { qty: 4, lampsPerFixture: 2, retrofitType: 'lamp', pricedPerLamp: false, price: 397.50 },
      { qty: 8, lampsPerFixture: 2, retrofitType: 'lamp', pricedPerLamp: false, price: 391.00 },
    ]
    const total = lines.reduce((s, l) => s + l.price * orderQty(l), 0)
    expect(total).toBeCloseTo(20549.90, 2)
  })
})

describe('lampCount', () => {
  it('counts physical lamps regardless of how the product is priced', () => {
    // Maintenance relamps four tubes per fixture even when we sell one highbay.
    expect(lampCount({ qty: 30, lampsPerFixture: 4, retrofitType: 'lamp', pricedPerLamp: false })).toBe(120)
  })
  it('matches the pre-fix quantity, so maintenance math does not move', () => {
    const line = { qty: 8, lampsPerFixture: 2, retrofitType: 'lamp' }
    const legacy = line.retrofitType === 'lamp' && line.lampsPerFixture > 1
      ? line.qty * line.lampsPerFixture : line.qty
    expect(lampCount(line)).toBe(legacy)
  })
  it('is fixture count for a fixture retrofit', () => {
    expect(lampCount({ qty: 8, lampsPerFixture: 2, retrofitType: 'fixture' })).toBe(8)
  })
})
