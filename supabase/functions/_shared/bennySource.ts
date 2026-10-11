// Benny's pricing hand, on its own so more than one agent can borrow it.
//
// The rule (Bryce, 2026-09-25, when web search went into Benny): when the
// catalog does not carry a thing, do not guess a number and do not give up —
// search for it, bring back the page the price was read on, and leave the
// line REDLINED until a person opens that page and ticks verified. A bid or an
// estimate with an unverified sourced price cannot be sent
// (_shared/sourcedPricing.ts, enforced by send-estimate).
//
// It lived inside benny-bid-intake's price stage until 2026-09-29, when Arnie
// needed the same thing for an estimate line the price book has never heard of
// (Bryce: "When Arnie builds an estimate and we don't have the product use
// Benny to find and estimate the product and time or labor"). One sourcing
// rule, two callers — the alternative is two, and the second one drifts.
//
// What Arnie needed that a bid does not: the LABOUR. A bid schedule prices
// supply; an estimate has to say who spends how long fitting it. So `hours`
// is asked for only when the caller wants it, and it is priced by the
// tenant's own labour rate, never by a number the model typed.

import { callAnthropic } from './anthropic.ts'

// deno-lint-ignore no-explicit-any
type Any = any
const MODEL = 'claude-sonnet-5', FALLBACK = 'claude-sonnet-4-6'
const textOf = (r: Any) => (r?.data?.content || []).map((c: Any) => c.text || '').join('')
const parseJson = (t: string) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in reply'); return JSON.parse(m[0]) }
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100

export interface SourceAsk {
  /** Whatever the caller wants the answer keyed by — a bid item_no, a line index. */
  key: string
  description: string
  quantity?: number
  unit?: string | null
  /** The buyer's spec text, when there is one. */
  spec?: string | null
}

export interface SourcedPrice {
  unit_price: number
  source_url: string
  source_title: string
  note: string
  /** Only when the caller asked for labour: hours to fit ONE unit. */
  hours?: number | null
  hours_note?: string | null
}

export interface SourceOpts {
  feature: string
  companyId: number
  /** Ask for the time as well as the price. */
  withLabour?: boolean
  /** What the trade is, so the hours are not guessed in a vacuum. */
  trade?: string | null
  maxSearches?: number
}

/**
 * Price what the catalog does not carry, from the web, with the page.
 *
 * Returns only what it is sure of: a price with no real URL, or no price at
 * all, is left out rather than filled in — the caller then says it could not
 * source it, which is a true answer. A failed search is never fatal.
 */
export async function sourcePrices(asks: SourceAsk[], opts: SourceOpts): Promise<{ found: Record<string, SourcedPrice>; searches: number }> {
  const found: Record<string, SourcedPrice> = {}
  let searches = 0
  if (!asks.length) return { found, searches }

  const units = [...new Set(asks.map((a) => a.unit || 'EA'))].join(', ')
  const labour = opts.withLabour
    ? `\n- hours: how long it takes ONE crew member to fit ONE unit, as a decimal (0.5, 1.25). Base it on how the work is actually done${opts.trade ? ` in ${opts.trade}` : ''}. Leave it out if the item is not something anybody installs (a permit, a fee, a delivery).\n- hours_note: one short line on what that time covers.`
    : ''
  const shape = opts.withLabour
    ? `{ "prices": [ { "key": "...", "unit_price": 0.00, "source_url": "https://...", "source_title": "page title", "product": "what the page sells", "note": "how it compares and what the price includes", "hours": 0.0, "hours_note": "..." } ] }`
    : `{ "prices": [ { "key": "...", "unit_price": 0.00, "source_url": "https://...", "source_title": "page title", "product": "what the page sells", "note": "how it compares to the spec and what the price includes" } ] }`

  const prompt = `You are Benny, pricing items a contractor's own catalog does not carry. Use web search to find a CURRENT purchasable unit price for each item below from a real supplier or distributor page.

Return ONLY a JSON object:
${shape}

Rules: unit_price is the price PER UNIT (${units}). source_url must be the exact page you read the price on — never invent one, never use a search-results URL. If you cannot find a real page for an item, leave that item out entirely rather than guessing.${labour}

ITEMS:
${asks.map((a) => `- key ${a.key}${a.quantity ? ` qty ${a.quantity}` : ''} ${a.unit || ''}: ${a.description}${a.spec ? ` — SPEC: ${String(a.spec).slice(0, 500)}` : ''}`).join('\n')}`

  try {
    const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(opts.maxSearches ?? 12, Math.max(3, asks.length * 3)) }]
    let messages: Any[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    let text = ''
    for (let hop = 0; hop < 3; hop++) {
      let r = await callAnthropic({ feature: opts.feature, companyId: opts.companyId }, { model: MODEL, max_tokens: 8192, messages, tools })
      if (!r.ok && r.status === 404) r = await callAnthropic({ feature: opts.feature, companyId: opts.companyId }, { model: FALLBACK, max_tokens: 8192, messages, tools })
      if (!r.ok) { console.warn('[bennySource] web pricing unavailable:', r.friendly); break }
      searches += (r.data?.usage?.server_tool_use?.web_search_requests as number) || 0
      text = textOf(r)
      // A long search can pause mid-turn; hand the transcript back and let it finish.
      if (r.data?.stop_reason !== 'pause_turn') break
      messages = [...messages, { role: 'assistant', content: r.data.content }]
    }
    const parsed = text ? parseJson(text) : null
    for (const p of parsed?.prices || []) {
      const url = String(p.source_url || '').trim()
      const price = Number(p.unit_price)
      // A price without the page it came from is exactly the guess this
      // exists to prevent.
      if (!/^https?:\/\/\S+\.\S+/i.test(url) || !(price > 0)) continue
      const hours = Number(p.hours)
      found[String(p.key)] = {
        unit_price: r2(price), source_url: url,
        source_title: String(p.source_title || '').slice(0, 160),
        note: [p.product, p.note].filter(Boolean).join(' — ').slice(0, 600),
        ...(opts.withLabour && Number.isFinite(hours) && hours > 0 && hours <= 200
          ? { hours: Math.round(hours * 100) / 100, hours_note: String(p.hours_note || '').slice(0, 200) || null }
          : {}),
      }
    }
  } catch (e) {
    // A failed search is not a reason to lose the estimate: the caller says it
    // could not source the line, and a person prices it.
    console.warn('[bennySource] web pricing failed:', (e as Error)?.message)
  }
  return { found, searches }
}

/** The tenant's own labour rate — never a number a model typed. */
export async function labourRate(r: { url: string; key: string }, companyId: number): Promise<{ id: number; name: string; rate: number } | null> {
  const res = await fetch(`${r.url}/rest/v1/labor_rates?select=id,name,rate_per_hour,is_default,active&company_id=eq.${companyId}&active=eq.true&order=is_default.desc,id&limit=5`,
    { headers: { apikey: r.key, Authorization: `Bearer ${r.key}` } })
  if (!res.ok) return null
  const rows = await res.json().catch(() => [])
  const row = rows?.[0]
  const rate = Number(row?.rate_per_hour)
  return row && rate > 0 ? { id: row.id, name: row.name || 'Labor', rate: Math.round(rate * 100) / 100 } : null
}
