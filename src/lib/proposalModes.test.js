import { describe, it, expect } from 'vitest'
import {
  PROPOSAL_MODES, proposalMode, sendButtonLabel, proposalModeOptions, DEFAULT_PROPOSAL_MODE,
} from './proposalModes'

describe('the button says what is actually being sent', () => {
  // It read "Send Proposal" for all three modes. 79 of 110 sent estimates went
  // as the bare PDF while the interactive one sat built and unused, and Cole
  // reported it as the link not showing savings.
  it('names the mode, not the generic word', () => {
    expect(sendButtonLabel('pdf')).toBe('Send Regular Estimate')
    expect(sendButtonLabel('interactive')).toBe('Send Interactive Quote')
    expect(sendButtonLabel('formal')).toBe('Send Formal Proposal')
  })

  it('switches to resend once it has gone out', () => {
    expect(sendButtonLabel('interactive', true)).toBe('Resend Interactive Quote')
    expect(sendButtonLabel('pdf', true)).toBe('Resend Regular Estimate')
  })

  it('never leaves the label blank on an unknown stored mode', () => {
    // A bad value must not hide the only send button on the page.
    for (const junk of ['nonsense', null, undefined, '']) {
      expect(sendButtonLabel(junk)).toBe('Send Regular Estimate')
      expect(proposalMode(junk).id).toBe(DEFAULT_PROPOSAL_MODE)
    }
  })
})

describe('what each mode carries', () => {
  it('keeps savings off the regular estimate but keeps the incentive', () => {
    // Bryce's rule: it is a quote, not a pitch.
    expect(PROPOSAL_MODES.pdf.showsSavings).toBe(false)
    expect(PROPOSAL_MODES.pdf.showsIncentive).toBe(true)
  })

  it('puts the full case on the interactive one', () => {
    expect(PROPOSAL_MODES.interactive.showsSavings).toBe(true)
    expect(PROPOSAL_MODES.interactive.showsIncentive).toBe(true)
  })
})

describe('the selector', () => {
  it('offers all three, cheapest document first and the contract last', () => {
    expect(proposalModeOptions().map(m => m.id)).toEqual(['pdf', 'interactive', 'formal'])
  })

  it('gives every option a blurb, so a rep can tell them apart', () => {
    for (const m of proposalModeOptions()) {
      expect(m.blurb.length).toBeGreaterThan(20)
      expect(m.label).toBeTruthy()
    }
  })
})
