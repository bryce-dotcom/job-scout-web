import { describe, it, expect } from 'vitest'
import { deliveryStagesFrom, jobStatusId, jobStatusName } from './pipelineStages.js'

// HHH's job statuses as configured on 2026-10-11: the last one is renamed
// (id Paid, board label Payments) and Invoiced / Closed are its own statuses.
const hhh = [
  { id: 'Chillin', name: 'Chillin', color: '#3b82f6', category: 'open' },
  { id: 'Scheduled', name: 'Scheduled', color: '#22c55e', category: 'open' },
  { id: 'Completed', name: 'Completed', color: '#16a34a', category: 'delivered' },
  { id: 'Invoiced', name: 'Invoiced', color: '#8b5cf6', category: 'delivered' },
  { id: 'Paid', name: 'Payments', color: '#16a34a', category: 'delivered' },
  { id: 'Closed', name: 'Closed', color: '#6b7280', category: 'delivered' },
]

describe('deliveryStagesFrom: columns keyed by the status ID, labelled by the name', () => {
  const stages = deliveryStagesFrom(hhh, { reserved: ['Closed', 'Lost'] })
  it('a renamed stage keeps its id as the column id — a lead at Paid lands in the Payments column', () => {
    const paid = stages.find((s) => s.id === 'Paid')
    expect(paid).toMatchObject({ id: 'Paid', name: 'Payments', isDelivery: true, category: 'delivered', color: '#16a34a' })
    expect(stages.find((s) => s.id === 'Payments')).toBeUndefined()
  })
  it("does not duplicate the board's Closed column or the company's own Invoiced", () => {
    expect(stages.filter((s) => s.id === 'Invoiced')).toHaveLength(1)
    expect(stages.find((s) => s.id === 'Closed')).toBeUndefined()
    expect(stages.map((s) => s.id)).toEqual(['Chillin', 'Scheduled', 'Completed', 'Invoiced', 'Paid'])
  })
  it('appends Invoiced when the company has no such status, and reads plain strings', () => {
    expect(deliveryStagesFrom(['Chillin', 'Scheduled']).map((s) => s.id)).toEqual(['Chillin', 'Scheduled', 'Invoiced'])
    expect(deliveryStagesFrom(['Chillin'])[0]).toEqual({ id: 'Chillin', name: 'Chillin', color: '#94a3b8', isDelivery: true })
  })
  it('skips junk and survives nothing', () => {
    expect(deliveryStagesFrom([null, {}, { name: 'Only a name' }]).map((s) => s.id)).toEqual(['Only a name', 'Invoiced'])
    expect(deliveryStagesFrom().map((s) => s.id)).toEqual(['Invoiced'])
    expect(deliveryStagesFrom(undefined, { reserved: ['Invoiced'] })).toEqual([])
  })
})

describe('jobStatusId / jobStatusName', () => {
  it('id first, name as the fallback, strings as both', () => {
    expect(jobStatusId({ id: 'Paid', name: 'Payments' })).toBe('Paid')
    expect(jobStatusName({ id: 'Paid', name: 'Payments' })).toBe('Payments')
    expect(jobStatusId({ name: 'Scheduled' })).toBe('Scheduled')
    expect(jobStatusId('Chillin')).toBe('Chillin')
    expect(jobStatusName('Chillin')).toBe('Chillin')
    expect(jobStatusId(null)).toBe(null)
  })
})
