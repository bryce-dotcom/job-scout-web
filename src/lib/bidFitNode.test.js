import { describe, it, expect } from 'vitest'
import { dedupeHash as denoHash } from './bidFit'
import { parseFeed } from '../../api/cron/sal-ingest.js'
import nodeFit from '../../api/_lib/bidFitNode.cjs'

// The SAM.gov cron (Node) and the parser (Deno) must produce the same key
// for the same solicitation, or the same bid shows up twice on the board.
describe('one dedupe key on both runtimes', () => {
  it('agrees with and without a solicitation number', () => {
    const a = { solicitation_number: 'W912WJ-26-Q-A026', buyer: 'USACE New England', title: 'LED Lighting Retrofit', due_at: '2026-10-14T18:00:00Z' }
    const b = { buyer: 'City of Ogden', title: 'Lorin Farr Park LED Retrofit', due_at: '2026-10-06T20:00:00Z' }
    expect(nodeFit.dedupeHash(a)).toBe(denoHash(a))
    expect(nodeFit.dedupeHash(b)).toBe(denoHash(b))
  })
})

describe('the RSS reader copes with what public bodies publish', () => {
  it('reads RSS 2.0 items with CDATA and guids', () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Ogden City</title>
      <item><title><![CDATA[Invitation to Bid: Lorin Farr Park LED Retrofit]]></title><link>https://www.utah.gov/pmn/sitemap/notice/994041.html</link><guid isPermaLink="false">pmn-994041</guid><pubDate>Fri, 25 Sep 2026 16:00:00 GMT</pubDate><description><![CDATA[<p>Sealed bids due <b>Oct 14, 2026 2:00 PM</b></p>]]></description></item>
      <item><title>Public Meeting Notice</title><link>https://www.utah.gov/pmn/sitemap/notice/994042.html</link></item>
    </channel></rss>`
    const items = parseFeed(xml)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ title: 'Invitation to Bid: Lorin Farr Park LED Retrofit', guid: 'pmn-994041', link: 'https://www.utah.gov/pmn/sitemap/notice/994041.html' })
    expect(items[0].desc).toBe('Sealed bids due Oct 14, 2026 2:00 PM')
    expect(items[1].guid).toBe('https://www.utah.gov/pmn/sitemap/notice/994042.html')
  })
  it('reads Atom entries (Google Alerts)', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:google.com,2005:reader/item/1</id><title>invitation to bid lighting Salt Lake</title><link href="https://www.google.com/url?q=https://slco.org/bids/123"/><published>2026-09-25T10:00:00Z</published><content type="html">&lt;b&gt;Invitation&lt;/b&gt; to bid</content></entry></feed>`
    const items = parseFeed(xml)
    expect(items).toHaveLength(1)
    expect(items[0].link).toMatch(/slco\.org/)
    expect(items[0].guid).toBe('tag:google.com,2005:reader/item/1')
  })
  it('returns nothing for a page that is not a feed', () => {
    expect(parseFeed('<html><body>Login</body></html>')).toEqual([])
  })
})
