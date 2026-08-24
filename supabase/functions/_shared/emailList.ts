// Turning what someone types into a list of addresses an email API will accept.
//
// Tracy (9d5a7267): "Is there a way to add multiple emails to one invoice? Or
// even a way to CC someone on an invoice email so a couple of people can see
// the same invoice at the same time. We had this with house call pro. It made
// it nice that you put in a few emails instead of sending an invoice one at a
// time."
//
// People type these the way they talk: commas, semicolons, a stray space, a
// name in front of the address, the same person twice. Resend takes an array
// and rejects the whole send if one entry is malformed — so one fat-fingered
// address must not stop the invoice reaching the other three.
//
// Lives in _shared so the edge function that actually sends and the vitest
// suite that proves the rules are the same code, not two copies that agree
// until one is edited.

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Pull the address out of `Becky <becky@mtnpm.com>`. */
function bare(raw: unknown): string {
  const s = String(raw ?? '').trim()
  const angled = s.match(/<([^>]+)>/)
  return (angled ? angled[1] : s).trim().toLowerCase()
}

export interface EmailListResult { valid: string[]; invalid: string[] }

/**
 * Split typed input into { valid, invalid }.
 *
 * `exclude` drops addresses already used elsewhere on the same send — copying
 * someone who is already the main recipient sends them two of everything.
 */
export function parseEmailList(
  input: unknown,
  { exclude = [] as string[] | string, max = 10 } = {},
): EmailListResult {
  const skip = new Set((Array.isArray(exclude) ? exclude : [exclude]).map(bare).filter(Boolean))
  const parts = (Array.isArray(input) ? input : String(input ?? '').split(/[,;\n]+/))
    .map(bare)
    .filter(Boolean)

  const valid: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (!ADDRESS.test(p)) { invalid.push(p); continue }
    if (skip.has(p) || seen.has(p)) continue
    seen.add(p)
    if (valid.length < max) valid.push(p)
  }
  return { valid, invalid }
}

/** True when every address typed is usable (an empty box is fine). */
export function emailListIsClean(input: unknown, opts = {}): boolean {
  return parseEmailList(input, opts).invalid.length === 0
}
