import { describe, it, expect } from 'vitest'
import {
  stageForQuoteStatus, leadRendersSomewhere, shouldShowLeadFallback,
} from './pipelineVisibility'

const MAP = { 'Quote Sent': 'Sent', Negotiation: 'Negotiation', Won: 'Approved', Lost: 'Rejected' }
const lead = (status, ...quoteStatuses) => ({ id: 1, status, _quotes: quoteStatuses.map((s, i) => ({ id: i + 1, status: s })) })

describe('which column a quote belongs to', () => {
  it('maps the staged statuses', () => {
    expect(stageForQuoteStatus('Approved', MAP)).toBe('Won')
    expect(stageForQuoteStatus('Sent', MAP)).toBe('Quote Sent')
  })

  it('gives a Draft no column', () => {
    expect(stageForQuoteStatus('Draft', MAP)).toBeNull()
    expect(stageForQuoteStatus(undefined, MAP)).toBeNull()
  })
})

describe('the deals that vanished', () => {
  // 59 of these existed on company 3.
  it('an Approved quote on a lead still marked Quote Sent renders nowhere', () => {
    const l = lead('Quote Sent', 'Approved')
    expect(leadRendersSomewhere(l, MAP)).toBe(false)
    // ...so the lead card must appear at its own status instead.
    expect(shouldShowLeadFallback(l, 'Quote Sent', MAP)).toBe(true)
  })

  it('Noah: moved to Negotiation with only an Approved quote', () => {
    const l = lead('Negotiation', 'Approved')
    expect(shouldShowLeadFallback(l, 'Negotiation', MAP)).toBe(true)
  })

  it('a lead whose quotes are all Drafts still shows', () => {
    const l = lead('Negotiation', 'Draft', 'Draft')
    expect(leadRendersSomewhere(l, MAP)).toBe(false)
    expect(shouldShowLeadFallback(l, 'Negotiation', MAP)).toBe(true)
  })

  it('a lead with no quotes at all still shows', () => {
    expect(shouldShowLeadFallback({ id: 1, status: 'Negotiation' }, 'Negotiation', MAP)).toBe(true)
  })
})

describe('it must never duplicate a card that already renders', () => {
  it('no fallback when a quote already sits in this column', () => {
    const l = lead('Quote Sent', 'Sent')
    expect(leadRendersSomewhere(l, MAP)).toBe(true)
    expect(shouldShowLeadFallback(l, 'Quote Sent', MAP)).toBe(false)
  })

  it('no fallback when a quote renders in a DIFFERENT column', () => {
    // The lead is Won and a quote sits in Quote Sent: it is findable there,
    // so adding a second card would double-count the board totals.
    const l = lead('Won', 'Sent')
    expect(leadRendersSomewhere(l, MAP)).toBe(true)
    expect(shouldShowLeadFallback(l, 'Won', MAP)).toBe(false)
  })

  it('never adds a card to a column that is not the lead\'s own status', () => {
    const l = lead('Quote Sent', 'Approved')
    for (const s of ['Negotiation', 'Won', 'Lost', 'Qualified']) {
      expect(shouldShowLeadFallback(l, s, MAP)).toBe(false)
    }
  })
})

describe('the Won guard is respected', () => {
  it('an Approved quote counts only when the lead is Won', () => {
    expect(leadRendersSomewhere(lead('Won', 'Approved'), MAP)).toBe(true)
    expect(leadRendersSomewhere(lead('Negotiation', 'Approved'), MAP)).toBe(false)
  })
})

describe('junk', () => {
  it('survives missing input', () => {
    expect(leadRendersSomewhere(null, MAP)).toBe(false)
    expect(leadRendersSomewhere({}, MAP)).toBe(false)
    expect(shouldShowLeadFallback(null, 'Won', MAP)).toBe(false)
  })
})
