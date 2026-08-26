// Estimate intake, written over PostgREST — the edge-function half of the
// writer that src/lib/estimateIntake.js already provides to the browser.
//
// estimateIntake.ts owns the SHAPE and stays dependency-free. It says each
// caller "still does its own writes with its own client", and that is the part
// that keeps breaking. Four producers, two clients, and only the two on a
// supabase-js client shared a writer:
//
//   Zach modal / Don takeoff   createEstimateFromIntake (src/lib) — rolls back
//   lenard-save                hand-rolled REST
//   zach-instant-quote         hand-rolled REST
//
// Both hand-rolled copies were wrong, in opposite directions:
//
//   lenard-save wrapped every write in a supabasePost that THROWS on a non-2xx
//   response. So the real failure — PostgREST rejecting the quote_lines batch —
//   threw straight past the rollback block underneath it and into the outer
//   catch, which returned a 500 and left the quotes header sitting there with a
//   headline total and nothing under it. The rollback it appeared to have could
//   only fire on a 2xx short write, which a single batch POST cannot produce.
//
//   zach-instant-quote did roll back, but wrote `lrRes.ok ? await lrRes.json()
//   : null` and so discarded the response body on the one path where the body
//   is the only thing that explains anything. It logged "quote_lines insert
//   failed; header rolled back" with no reason and no check that the DELETE
//   landed — a log line that cannot be acted on, asserting an outcome it never
//   confirmed.
//
// So the write is shared now too, on both sides of the runtime split, and it
// verifies its own rollback rather than announcing one.

import {
  type EstimateIntake,
  intakeLineRows,
  intakeQuoteRow,
  intakeResidual,
  validateIntake,
} from './estimateIntake.ts'

/** Where to write, and what to authenticate with. */
export interface RestTarget {
  /** SUPABASE_URL, no trailing slash. */
  baseUrl: string
  /** Authorization + apikey + Content-Type, as each function already builds. */
  headers: Record<string, string>
}

export interface IntakeWriteResult {
  /** The quotes row as the database returned it. */
  quote: Record<string, unknown>
  quoteId: number
  /** Lines the database CONFIRMED, never the count we hoped to send. */
  lineCount: number
  residual: number
}

/**
 * Thrown for every failure below, so a caller can tell an intake failure from
 * a network blowup, and can tell whether a header is still out there.
 */
export type IntakeWriteFailure = 'invalid' | 'header' | 'lines'

export class IntakeWriteError extends Error {
  /**
   * Where it went wrong. 'invalid' is the caller's payload and nothing was
   * written, so an HTTP caller should answer 4xx; the other two are ours.
   */
  readonly kind: IntakeWriteFailure
  /** False when the lines failed AND the rollback DELETE also failed. */
  readonly rolledBack: boolean
  /** The header id left behind when rolledBack is false. */
  readonly orphanQuoteId: number | null

  constructor(
    message: string,
    kind: IntakeWriteFailure,
    opts: { rolledBack?: boolean; orphanQuoteId?: number | null } = {},
  ) {
    super(message)
    this.name = 'IntakeWriteError'
    this.kind = kind
    this.rolledBack = opts.rolledBack ?? true
    this.orphanQuoteId = opts.orphanQuoteId ?? null
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

/** A short, log-safe rendering of whatever PostgREST said. */
function why(body: unknown): string {
  if (body == null) return 'no response body'
  if (typeof body === 'string') return body.slice(0, 400)
  const e = body as Record<string, unknown>
  const parts = [e.message, e.details, e.hint, e.code].filter(Boolean).map(String)
  return (parts.length ? parts.join(' | ') : JSON.stringify(body)).slice(0, 400)
}

/**
 * Create a quote and its lines from an intake, then link it back.
 *
 * Mirrors createEstimateFromIntake in src/lib/estimateIntake.js one for one:
 * an estimate is the header and its lines together or it is nothing, so a line
 * failure rolls the header back and throws rather than leaving half a bid.
 *
 * @param options.advanceLeadTo lead status to set, or null to leave it alone.
 *        Zach and Don push a finished bid and advance to "Estimate Sent";
 *        Lenard auto-creates a Draft when an audit is saved and nothing has
 *        been sent to anyone, so it passes null.
 */
export async function createEstimateFromIntakeRest(
  target: RestTarget,
  intake: EstimateIntake,
  options: { advanceLeadTo?: string | null } = {},
): Promise<IntakeWriteResult> {
  const { advanceLeadTo = 'Estimate Sent' } = options
  const { baseUrl, headers } = target

  const problems = validateIntake(intake)
  if (problems.length) {
    throw new IntakeWriteError(
      `Cannot create estimate from ${intake?.source || 'unknown'} intake:\n  - ${problems.join('\n  - ')}`,
      'invalid',
    )
  }

  const qRes = await fetch(`${baseUrl}/rest/v1/quotes`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(intakeQuoteRow(intake)),
  })
  const qBody = await readBody(qRes)
  const quote = Array.isArray(qBody) ? qBody[0] : null
  const quoteId = Number(quote?.id)
  if (!qRes.ok || !quoteId) {
    throw new IntakeWriteError(`Estimate header failed: ${why(qBody)}`, 'header')
  }

  const rows = intakeLineRows(intake, quoteId)
  const lRes = await fetch(`${baseUrl}/rest/v1/quote_lines`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(rows),
  })
  const lBody = await readBody(lRes)
  const written = Array.isArray(lBody) ? lBody : null

  // Count what the database confirmed. A partial write is also a failure: a
  // headline total with only some of the work itemised under it is worse than
  // no quote, because it looks finished.
  const count = written?.length ?? 0
  if (!lRes.ok || count !== rows.length) {
    const reason = !lRes.ok
      ? why(lBody)
      : `only ${count} of ${rows.length} lines were written`

    // Roll the header back — and confirm it, rather than assert it. This is the
    // one branch where being wrong about what happened leaves a bad document in
    // front of a customer, so it does not get to guess.
    let rolledBack = false
    try {
      const dRes = await fetch(`${baseUrl}/rest/v1/quotes?id=eq.${quoteId}`, {
        method: 'DELETE',
        headers: { ...headers, 'Prefer': 'return=representation' },
      })
      const dBody = await readBody(dRes)
      rolledBack = dRes.ok && Array.isArray(dBody) && dBody.length === 1
    } catch { /* rolledBack stays false */ }

    throw new IntakeWriteError(
      rolledBack
        ? `Estimate lines failed, header rolled back: ${reason}. Nothing was left half-made.`
        : `Estimate lines failed AND the rollback failed: ${reason}. Quote #${quoteId} is still in the pipeline with a total and no lines — delete it.`,
      'lines',
      { rolledBack, orphanQuoteId: rolledBack ? null : quoteId },
    )
  }

  if (intake.lead_id) {
    const patch: Record<string, unknown> = { quote_id: quoteId }
    if (advanceLeadTo) patch.status = advanceLeadTo
    await fetch(`${baseUrl}/rest/v1/leads?id=eq.${intake.lead_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patch),
    })
  }

  return { quote: quote as Record<string, unknown>, quoteId, lineCount: count, residual: intakeResidual(intake) }
}
