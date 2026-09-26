import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_TYPES, labelsFor, documentConfig, navLabel, documentType, documentLabels, unverifiedSendRule, configFromSettings, documentWord } from './documentVocabulary'

describe('what the company calls it', () => {
  it('a company that never configured anything writes estimates', () => {
    expect(documentConfig(null)).toEqual({ enabled: ['estimate'], primary: 'estimate' })
    expect(navLabel(null)).toEqual({ primary: 'Estimates', secondary: 'Bids · Proposals' })
  })

  it('reads the setting whether it arrives as an object or a JSON string', () => {
    const obj = { enabled: ['bid', 'estimate'], primary: 'bid' }
    expect(documentConfig(obj).primary).toBe('bid')
    expect(documentConfig(JSON.stringify(obj)).primary).toBe('bid')
  })

  it('survives a half-saved setting rather than leaving the nav blank', () => {
    expect(documentConfig({ enabled: [], primary: 'bid' })).toEqual({ enabled: ['estimate'], primary: 'estimate' })
    expect(documentConfig({ enabled: ['bid'], primary: 'proposal' })).toEqual({ enabled: ['bid'], primary: 'bid' })
    expect(documentConfig('not json at all').primary).toBe('estimate')
    expect(documentConfig({ enabled: ['nonsense'] }).enabled).toEqual(['estimate'])
  })

  it('is not fooled by casing', () => {
    expect(documentConfig({ enabled: ['BID', 'Proposal'], primary: 'Bid' }))
      .toEqual({ enabled: ['bid', 'proposal'], primary: 'bid' })
  })
})

describe('the nav entry', () => {
  // Estimates in the normal size with the other two small underneath, and
  // whatever the company picks becomes the big word. The second line is
  // always there — it tells anyone that this one page holds all three.
  it('a company that configured nothing leads with Estimates and names the other two', () => {
    expect(navLabel(null)).toEqual({ primary: 'Estimates', secondary: 'Bids · Proposals' })
  })

  it('whatever the company picks becomes the big word, with the other two underneath', () => {
    expect(navLabel({ enabled: ['bid'], primary: 'bid' }))
      .toEqual({ primary: 'Bids', secondary: 'Estimates · Proposals' })
    expect(navLabel({ enabled: ['proposal'], primary: 'proposal' }))
      .toEqual({ primary: 'Proposals', secondary: 'Estimates · Bids' })
  })

  it('says the other two even when the company only produces one kind', () => {
    // The line is a signpost, not an inventory.
    expect(navLabel({ enabled: ['estimate'], primary: 'estimate' }).secondary).toBe('Bids · Proposals')
  })

  it('reads the same order for everyone, whatever order they ticked', () => {
    const a = navLabel({ enabled: ['proposal', 'estimate', 'bid'], primary: 'estimate' })
    const b = navLabel({ enabled: ['bid', 'proposal', 'estimate'], primary: 'estimate' })
    expect(a).toEqual(b)
    expect(a.secondary).toBe('Bids · Proposals')
  })
})

describe('what to call one document', () => {
  const config = { enabled: ['estimate', 'bid'], primary: 'bid' }

  it('a document with no type of its own follows the company word', () => {
    // So renaming does not mean relabelling ten thousand old rows.
    expect(documentType({ id: 1 }, config)).toBe('bid')
    expect(documentLabels({ id: 1 }, config).one).toBe('Bid')
  })

  it('a document that knows what it is keeps it, whatever the company leads with', () => {
    expect(documentType({ document_type: 'estimate' }, config)).toBe('estimate')
    expect(documentLabels({ document_type: 'proposal' }, config)).toMatchObject({ one: 'Proposal', many: 'Proposals' })
  })

  it('a junk type falls back to a word rather than rendering blank', () => {
    expect(documentType({ document_type: 'invoice' }, config)).toBe('bid')
    expect(labelsFor('nonsense').one).toBe('Estimate')
    expect(labelsFor(null).many).toBe('Estimates')
  })

  it('every type has a full set of labels', () => {
    for (const t of DOCUMENT_TYPES) {
      const l = labelsFor(t)
      expect(l.one).toBeTruthy()
      expect(l.many).toBeTruthy()
      expect(l.article).toBeTruthy()
    }
  })
})

describe('an unverified sourced price', () => {
  // A bid is a document you are bound by; an estimate is a conversation.
  it('blocks the send on a bid and warns on the others', () => {
    expect(unverifiedSendRule('bid')).toBe('block')
    expect(unverifiedSendRule('estimate')).toBe('warn')
    expect(unverifiedSendRule('proposal')).toBe('warn')
  })
})

describe('reading it out of the store', () => {
  it('finds the row in the settings array the pages already hold', () => {
    const settings = [
      { key: 'job_statuses', value: '[]' },
      { key: 'document_types', value: JSON.stringify({ enabled: ['estimate', 'bid'], primary: 'bid' }) },
    ]
    expect(configFromSettings(settings)).toEqual({ enabled: ['estimate', 'bid'], primary: 'bid' })
  })

  it('a company with no such row still gets a word', () => {
    expect(configFromSettings([])).toEqual({ enabled: ['estimate'], primary: 'estimate' })
    expect(configFromSettings(null)).toEqual({ enabled: ['estimate'], primary: 'estimate' })
  })
})

describe('the word the customer sees', () => {
  // Before types existed the presentation mode chose the word. A company that
  // never touched the setting must keep sending exactly what it sends today.
  it('an untyped estimate keeps the per-mode word it always had', () => {
    expect(documentWord({}, null, 'pdf')).toBe('Estimate')
    expect(documentWord({}, null, undefined)).toBe('Estimate')
    expect(documentWord({}, null, 'interactive')).toBe('Proposal')
    expect(documentWord({}, null, 'formal')).toBe('Proposal')
  })

  it('a bid is a Bid in every mode — the buyer asked for one', () => {
    const bid = { document_type: 'bid' }
    expect(documentWord(bid, null, 'pdf')).toBe('Bid')
    expect(documentWord(bid, null, 'interactive')).toBe('Bid')
    expect(documentWord(bid, null, 'formal')).toBe('Bid')
  })

  it('an untyped document at a company that leads with bids is a Bid', () => {
    const raw = { enabled: ['estimate', 'bid'], primary: 'bid' }
    expect(documentWord({ document_type: null }, raw, 'pdf')).toBe('Bid')
    // ...and one deliberately made an estimate there stays an estimate.
    expect(documentWord({ document_type: 'estimate' }, raw, 'pdf')).toBe('Estimate')
  })

  it('a typed proposal says Proposal even on the plain PDF', () => {
    expect(documentWord({ document_type: 'proposal' }, null, 'pdf')).toBe('Proposal')
  })
})
