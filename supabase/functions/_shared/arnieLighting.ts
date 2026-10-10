// Arnie hands the lighting work to Lenard.
//
// A rep built himself a bot whose headline job was "identifies existing
// fixtures from rep photos, picks LED replacements, runs utility incentives".
// JobScout already has that — it is Lenard — but it lived behind its own page,
// so from anywhere else it may as well not have existed. If Arnie is the thing
// people use for work, the specialists are capabilities he CALLS, not
// destinations they have to go to.
//
// This is the first of those bridges and the pattern for the rest (Benny for
// bids, Frankie for the books, Freddy for the fleet, Don for excavation):
// Arnie does not reimplement the specialist, he asks it, with the caller's own
// identity, and reads the answer back in his own voice.
//
// It is also where a multi-tenant bug got fixed: lenard-analyze took its
// company from LENARD_COMPANY_ID, one hardwired tenant, because the audit
// pages called it with the anon key and it had no caller to ask. Every other
// company's fixture identification was being taught by somebody else's
// corrections. The caller's token decides now.

// deno-lint-ignore-file no-explicit-any
import type { Caller, Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'

type Any = any
const str = (v: unknown) => (v == null ? '' : String(v)).trim()
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/**
 * Identify the fixtures in a photo, as Lenard would on the audit page.
 *
 * The image arrives as base64 — from a browser attachment, or from the media
 * on a text message. Returns what Lenard saw plus what it dropped, because a
 * dropped item is usually the interesting one ("that is a camera, not a light").
 */
export async function analyseFixturePhoto(
  r: Rest & { internalKey?: string },
  caller: Caller,
  o: { imageBase64: string; mediaType?: string },
): Promise<Any> {
  if (!str(o.imageBase64)) return { error: 'There is no photo on this message for me to look at.' }
  const res = await fetch(`${r.url}/functions/v1/lenard-analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: r.key,
      Authorization: `Bearer ${r.key}`,
      ...(r.internalKey ? { 'x-arnie-internal': r.internalKey } : {}),
    },
    // as_employee_id so the function resolves the same company the caller is
    // in, rather than falling back to the hardwired tenant.
    body: JSON.stringify({ imageBase64: o.imageBase64, mediaType: o.mediaType || 'image/jpeg', as_employee_id: caller.employeeId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) return { error: str(body?.error) || `Lenard could not read that photo (${res.status}).` }

  const fixtures: Any[] = Array.isArray(body.fixtures) ? body.fixtures : []
  return {
    means: 'What Lenard sees in the photo. Existing wattage and a proposed LED, per fixture — not a quote. Quantities are what is visible in THIS photo.',
    fixtures: fixtures.map((f: Any) => ({
      fixture: str(f.name) || 'unnamed',
      quantity: num(f.qty ?? f.quantity ?? 1),
      existing_watts: num(f.existW ?? f.existingWatts),
      proposed_watts: num(f.newW ?? f.proposedWatts),
      mount: str(f.mount) || null,
      height_ft: num(f.height) || null,
      note: str(f.note) || null,
    })),
    ...(Array.isArray(body.dropped) && body.dropped.length
      ? { not_lighting: body.dropped.map((d: Any) => `${str(d.name)} (${str(d.reason)})`) }
      : {}),
  }
}

/**
 * What this company sells for lighting, and which utility pays for it.
 *
 * The question behind "what do I put on this" — the price-book section the
 * company has chosen for Lenard (settings.lenard_product_sections), not a
 * guess at product names. Same rule the Lenard pages use.
 */
export async function lightingCatalogue(r: Rest, caller: Caller, input: Any = {}): Promise<Any> {
  const companyId = caller.companyId as number
  const [setting] = await readRecordList(r, `settings?select=value&company_id=eq.${companyId}&key=eq.lenard_product_sections&limit=1`)
  let sections: string[] = []
  if (setting?.value) {
    try {
      const parsed = JSON.parse(setting.value)
      sections = Array.isArray(parsed) ? parsed.map(String) : []
    } catch { sections = [] }
  }

  const want = str(input.like)
  const like = want ? `&name=ilike.*${encodeURIComponent(want)}*` : ''
  // The section lives in products_services.TYPE — the same filter
  // lenard-products builds, including the quoting that section names with
  // spaces and brackets need ("Electrical Services (Bundles)"). One rule for
  // which shelf lighting comes off, not a second one that drifts.
  const scope = sections.length
    ? `&type=in.(${sections.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(',')})`
    : ''
  const inSections = await readRecordList(
    r,
    `products_services?select=id,name,type,unit_price,cost&company_id=eq.${companyId}&active=eq.true${scope}${like}&order=type,name&limit=300`,
  )

  return {
    means: sections.length
      ? `The price-book sections this company sells lighting from (${sections.join(', ')}). Lenard prices from these, never from a name search.`
      : 'No lighting sections are configured for Lenard yet, so this is the whole active price book. Set them on the Lenard page so quotes come from the right shelf.',
    sections,
    products: inSections.slice(0, 60).map((p: Any) => ({ product: str(p.name), price: num(p.unit_price), section: str(p.type) || null })),
    ...(inSections.length > 60 ? { showing: 60, of: inSections.length } : {}),
  }
}
