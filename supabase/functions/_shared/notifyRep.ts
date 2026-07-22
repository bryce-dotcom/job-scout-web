// Shared: notify an estimate's owning rep by email. Best-effort — NEVER throws,
// so it can be tacked onto acceptance / reply flows without risking the main
// work. Reps live in the field, so an in-app toast alone isn't enough; this
// reaches them wherever they are.

export interface RepEmailResult { sent: boolean; skipped?: string; error?: string; to?: string }

// deno-lint-ignore no-explicit-any
export async function emailRep(
  supabase: any,
  opts: { salespersonId: number | null | undefined; subject: string; html: string; replyTo?: string | null },
): Promise<RepEmailResult> {
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return { sent: false, skipped: 'no RESEND_API_KEY' }
    if (!opts.salespersonId) return { sent: false, skipped: 'no salesperson on estimate' }
    const { data: emp } = await supabase.from('employees').select('email, name').eq('id', opts.salespersonId).maybeSingle()
    const to = String(emp?.email || '').trim()
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { sent: false, skipped: 'rep has no valid email' }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'JobScout <invoices@appsannex.com>',
        to: [to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    })
    if (!res.ok) { const t = await res.text(); return { sent: false, error: `Resend ${res.status}: ${t.slice(0, 120)}`, to } }
    return { sent: true, to }
  } catch (e) {
    return { sent: false, error: String((e as Error)?.message || e) }
  }
}

// A consistent branded shell for rep emails.
export function repEmailShell(heading: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#2c3530">
    <div style="background:#5a6349;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">${heading}</div>
    <div style="border:1px solid #d6cdb8;border-top:none;border-radius:0 0 12px 12px;padding:22px;background:#fff">
      ${bodyHtml}
      ${ctaUrl ? `<div style="margin-top:18px"><a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;background:#5a6349;color:#fff;text-decoration:none;font-weight:600;border-radius:8px">${ctaLabel || 'Open in JobScout'}</a></div>` : ''}
    </div>
  </div>`
}

// Build a link to a document in the app (uses SITE_URL if configured).
export function appLink(path: string): string {
  const base = (Deno.env.get('SITE_URL') || '').replace(/\/$/, '')
  return base ? `${base}${path}` : ''
}
