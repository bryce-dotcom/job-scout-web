import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  matchInboundToEstimate, normalizeEmail, stripQuotedReply, type QuoteCandidate,
} from "../_shared/inboundMatch.ts";
import { parseReplyToken, tokenFromAddresses, parseFeedbackToken, feedbackTokenFromAddresses, parseBidsToken, bidsTokenFromAddresses } from "../_shared/replyToken.ts";
import { verifySvixSignature, htmlToText, isAutoReply, recipientKind, readEmail } from "../_shared/inboundWebhook.ts";
import { emailRep, repEmailShell, appLink } from "../_shared/notifyRep.ts";

// Catch customer replies to estimates and put them on the estimate.
//
// Until now a reply went nowhere. Estimates were sent with no reply-to, so a
// customer hitting Reply wrote to estimates@appsannex.com — a sending address
// nobody reads — and the message was simply lost. The portal has had two-way
// messaging all along (customer-portal-message writes the same rows this does),
// but customers reply to the email, not the portal: 110 messages exist and not
// one is from a customer.
//
// This accepts an inbound-email webhook, works out which estimate the reply
// belongs to, and writes it into estimate_messages so it appears in the
// conversation on the estimate page and lights up the pipeline card.
//
// Deliberately tolerant of payload shape. Resend Inbound, Cloudflare Email
// Routing, SendGrid Inbound Parse and a plain mailbox forwarder all describe an
// email differently, and the point of this endpoint is that whichever one gets
// pointed at it, replies stop disappearing.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Resend's `email.received` webhook is metadata only. Their docs: "Webhooks do
// not include the email body, headers, or attachments, only their metadata."
// The words the customer wrote are one more call away, and without this call
// every reply would land on the estimate as "(empty reply)" — matched to the
// right place and useless once you got there.
type Received = { body: string; html: string; headers: Record<string, unknown> };
async function fetchResendReceived(emailId: string): Promise<Received> {
  const none: Received = { body: '', html: '', headers: {} };
  // Reading a received email needs a FULL-ACCESS key. The sending key the
  // rest of the app uses ("Jobscout Invoices", sending access) gets
  // 401 restricted_api_key here — seen in Resend's API log on 2026-09-11 —
  // so the receiver has its own, falling back only so the failure is logged
  // rather than silent.
  const key = Deno.env.get('RESEND_INBOUND_API_KEY') || Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.error('[inbound-email] Resend event but no RESEND_INBOUND_API_KEY / RESEND_API_KEY — reply body unavailable');
    return none;
  }
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error('[inbound-email] Resend receiving fetch failed:', res.status, detail,
        res.status === 401 ? '— set RESEND_INBOUND_API_KEY to a Full-access Resend key; a sending-only key cannot read received mail' : '');
      return none;
    }
    const e = await res.json();
    const headers = (e && typeof e.headers === 'object' && e.headers) ? e.headers : {};
    const html = String(e?.html || '');
    if (typeof e?.text === 'string' && e.text.trim()) return { body: e.text, html, headers };
    return { body: htmlToText(html), html, headers };
  } catch (err) {
    console.error('[inbound-email] Resend receiving fetch threw:', (err as Error)?.message);
    return none;
  }
}

// Sal's inbox keeps attachments. A portal alert often carries the notice as
// a PDF, and a forwarded GC invitation carries the whole package; those are
// what Benny reads later. Resend serves them from a separate endpoint as
// signed download URLs, so each one is pulled and put in the tenant's
// storage before the URL expires. A file that will not fetch is recorded
// with its error rather than dropped — the row must always say what came.
type CapturedAttachment = {
  name: string; content_type: string | null; size: number | null;
  bucket?: string; storage_path?: string; fetched_at?: string; error?: string;
};
const ATTACHMENT_CAP = 30 * 1024 * 1024; // Benny's read limit, per file
async function captureBidAttachments(
  // deno-lint-ignore no-explicit-any
  supabase: any, companyId: number, emailId: string,
): Promise<CapturedAttachment[]> {
  const key = Deno.env.get('RESEND_INBOUND_API_KEY') || Deno.env.get('RESEND_API_KEY');
  if (!key) return [];
  let list: any[] = [];
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error('[inbound-email] Resend attachments list failed:', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return [];
    }
    const j = await res.json();
    list = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
  } catch (err) {
    console.error('[inbound-email] Resend attachments list threw:', (err as Error)?.message);
    return [];
  }
  const out: CapturedAttachment[] = [];
  for (const a of list) {
    const name = String(a?.filename || a?.name || 'attachment').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    const base: CapturedAttachment = { name, content_type: a?.content_type ?? a?.contentType ?? null, size: Number(a?.size) || null };
    if (base.size && base.size > ATTACHMENT_CAP) { out.push({ ...base, error: 'over 30 MB — not stored' }); continue; }
    const url = String(a?.download_url || a?.downloadUrl || '');
    if (!url) { out.push({ ...base, error: 'no download url' }); continue; }
    try {
      const f = await fetch(url);
      if (!f.ok) { out.push({ ...base, error: `download ${f.status}` }); continue; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (bytes.length > ATTACHMENT_CAP) { out.push({ ...base, error: 'over 30 MB — not stored' }); continue; }
      const path = `bids/${companyId}/inbox/${emailId}/${name}`;
      const { error: upErr } = await supabase.storage.from('project-documents')
        .upload(path, bytes, { contentType: base.content_type || 'application/octet-stream', upsert: true });
      if (upErr) { out.push({ ...base, error: `store: ${upErr.message}` }); continue; }
      out.push({ ...base, size: bytes.length, bucket: 'project-documents', storage_path: path, fetched_at: new Date().toISOString() });
    } catch (err) {
      out.push({ ...base, error: (err as Error)?.message || 'fetch failed' });
    }
  }
  return out;
}

// Resend signs every webhook (Svix format). With RESEND_WEBHOOK_SECRET set,
// a request that is not signed by it is refused — otherwise anyone who knows a
// customer's email address could POST a made-up "reply" and have it land on
// that customer's estimate through the sender-matching fallback below.
//
// With the secret unset, requests are accepted and the gap is logged on every
// request, so the endpoint keeps working while the secret is being set up and
// the log says exactly what is missing.
async function verifyResendSignature(req: Request, rawBody: string) {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') || '';
  if (!secret) {
    console.warn('[inbound-email] RESEND_WEBHOOK_SECRET not set — accepting unsigned request');
    return { ok: true };
  }
  return verifySvixSignature({
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }, rawBody, secret);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The signature covers the exact bytes sent, so read them before parsing.
  const rawBody = await req.text().catch(() => '');
  const sig = await verifyResendSignature(req, rawBody);
  if (!sig.ok) {
    // The reason is one of four fixed strings and names nothing secret; it is
    // returned because the provider's delivery log is the only place a
    // rejected webhook can be read from without dashboard access.
    console.warn('[inbound-email] refused unsigned request:', sig.reason);
    return json({ ok: false, error: 'invalid signature', reason: sig.reason }, 401);
  }

  let payload: Record<string, any> = {};
  try { payload = JSON.parse(rawBody); } catch { /* fall through to a 200 below */ }

  const mail = readEmail(payload);

  // Resend's webhook has told us an email exists; now go and read it.
  let headers: Record<string, unknown> = (payload?.data?.headers && typeof payload.data.headers === 'object') ? payload.data.headers : {};
  let mailHtml = '';
  if (!mail.body && payload?.type === 'email.received' && payload?.data?.email_id) {
    const got = await fetchResendReceived(String(payload.data.email_id));
    mail.body = got.body;
    mailHtml = got.html;
    headers = { ...headers, ...got.headers };
  }

  // Which of our addresses it came to is decided first, because Sal's inbox
  // must NOT go through the auto-reply filter: procurement portals send
  // their alerts with Auto-Submitted: auto-generated and Precedence: bulk —
  // exactly the headers that mark an out-of-office — and every alert would
  // be thrown away as one.
  const kindEarly = recipientKind(mail.to);

  // Out-of-office, bounces, delivery reports: nobody wrote these, and filing
  // one on an estimate would light the pipeline card up as "replied".
  if (kindEarly !== 'bids' && isAutoReply(mail.subject, headers)) {
    console.log(`[inbound-email] auto-reply from ${mail.from || '?'} ignored: "${mail.subject}"`);
    return json({ ok: true, matched: false, reason: 'auto_reply' });
  }

  // The MX covers the whole domain, so replies to invoice and receipt emails
  // arrive here too. Those are not estimate replies and must never be filed
  // on one; they are raised to the tenant instead, further down.
  let kind = kindEarly;

  // Always 200, even on rubbish.
  //
  // A mail provider retries a non-2xx, sometimes for days. A malformed payload
  // that 400s would come back every few minutes forever, and one that 500s
  // would look identical to a real outage.
  //
  // Nothing is silently dropped either way. estimate_messages.quote_id is NOT
  // NULL, so a reply we cannot place has nowhere to live there; instead it is
  // raised as a company notification, which puts it in front of a person rather
  // than in a log nobody opens. That is the difference between "we never lose a
  // reply" being true and being a slogan.
  if (!mail.from) {
    console.error('[inbound-email] payload had no From address:', Object.keys(payload || {}).join(','));
    return json({ ok: true, matched: false, reason: 'no_from_address' });
  }

  // A signed token in the reply-to address beats every heuristic — it names the
  // estimate outright, so a reply still lands correctly when it comes from a
  // colleague's address, from a phone, or with the subject line rewritten.
  //
  // The heuristic below stays as the fallback, because it is what handles mail
  // that arrives without a token: anything sent before reply-to was switched
  // over, and anyone who mails the inbound domain directly.
  // The signing secret must be its OWN secret, never the service role key.
  //
  // It was the service role key for about an hour, and that hour taught the
  // lesson: Supabase rotated SUPABASE_SERVICE_ROLE_KEY on 2026-08-25, so a
  // token signed before the rotation no longer verified after it. Every
  // outstanding reply address would have quietly stopped matching, and the
  // symptom — replies falling back to sender-guessing, or landing nowhere —
  // looks nothing like "a key changed".
  //
  // With no dedicated secret, token matching is SKIPPED rather than attempted
  // against the wrong key. Verifying with a secret that might be wrong is worse
  // than not verifying: it turns a deterministic match into a silent miss.
  const REPLY_SECRET = Deno.env.get('REPLY_TOKEN_SECRET') || '';

  // ── Sal's inbox: a procurement portal alert or a forwarded invitation ────
  // The bids+ token names the tenant. The mail is filed whole — text, html
  // (the solicitation links live in the anchors), attachments in storage —
  // on bid_inbox, and raised as a notification. Sal's parser (Phase 1) turns
  // the row into opportunities; until then it is visible on his Inbox tab.
  // A token that does not verify is ordinary mail, like a bad feedback token.
  if (kind === 'bids') {
    const bidsToken = bidsTokenFromAddresses([mail.to, ...(mail.allRecipients || [])]);
    const bidsCompanyId = bidsToken && REPLY_SECRET ? await parseBidsToken(bidsToken, REPLY_SECRET) : null;
    if (bidsCompanyId) {
      const emailId = payload?.data?.email_id ? String(payload.data.email_id) : null;
      const attachments = emailId ? await captureBidAttachments(supabase, bidsCompanyId, emailId) : [];
      const row = {
        company_id: bidsCompanyId,
        email_id: emailId,
        from_email: mail.from,
        subject: mail.subject || '(no subject)',
        text_body: mail.body || '',
        html_body: mailHtml || null,
        received_at: new Date().toISOString(),
        attachments,
        status: 'received',
        raw: { to: mail.to, recipients: mail.allRecipients || [], headers, provider: payload?.type || null },
      };
      // A provider retries a webhook for days; the unique index on
      // (company_id, email_id) makes the retry a no-op, not a duplicate.
      const q = emailId
        ? supabase.from('bid_inbox').upsert(row, { onConflict: 'company_id,email_id', ignoreDuplicates: true }).select('id')
        : supabase.from('bid_inbox').insert(row).select('id');
      const { data: inboxRows, error: ibErr } = await q;
      if (ibErr) {
        console.error('[inbound-email] could not file bid alert:', ibErr.message);
        return json({ ok: true, matched: false, kind: 'bids', reason: 'bid_inbox_write_failed' });
      }
      const inboxId = inboxRows?.[0]?.id ?? null;
      if (inboxId != null) {
        const stored = attachments.filter((a) => a.storage_path).length;
        const { error: nErr } = await supabase.from('company_notifications').insert({
          company_id: bidsCompanyId,
          type: 'bid_alert',
          title: `Sal: ${mail.subject || 'new bid alert'}`,
          message: `${mail.from} — ${(mail.body || '').replace(/\s+/g, ' ').slice(0, 240)}${stored ? ` (${stored} attachment${stored === 1 ? '' : 's'})` : ''}`,
          metadata: { bid_inbox_id: inboxId, from_email: mail.from, attachments: stored, route: '/agents/sal', source: 'inbound_email' },
          created_by: null,
        });
        if (nErr) console.error('[inbound-email] could not raise bid-alert notification:', nErr.message);
      }
      console.log(`[inbound-email] bid alert from ${mail.from} filed on Sal's inbox for company ${bidsCompanyId} (${attachments.length} attachment(s))`);
      return json({ ok: true, matched: true, kind: 'bids', company_id: bidsCompanyId, bid_inbox_id: inboxId, attachments: attachments.length });
    }
    console.warn(`[inbound-email] mail to a bids address did not resolve to a company (${bidsToken ? 'token did not verify' : 'no token'}) — handling as other mail`);
    kind = 'other';
  }

  // ── a reply to a feedback ticket ─────────────────────────────────────────
  // Ticket answers go out with reply_to = feedback+<token>@…, the token
  // naming the ticket. Before that they went out from noreply@ and a reply
  // landed here as mail from an address no estimate was ever sent to — which
  // is a console.warn and nothing else. Alayda's answer about the ABC Supply
  // discount went that way on 2026-09-11.
  //
  // The reply becomes the next entry in the ticket's thread, marked as the
  // reporter's, and is raised as a company notification so a person sees it.
  // A resolved ticket that gets a reply reopens: the reporter is saying it
  // is not done. A token that does not verify is treated as ordinary mail.
  if (kind === 'feedback') {
    const fbToken = feedbackTokenFromAddresses([mail.to, ...(mail.allRecipients || [])]);
    const ticketId = fbToken && REPLY_SECRET ? await parseFeedbackToken(fbToken, REPLY_SECRET) : null;
    const { data: ticket } = ticketId
      ? await supabase.from('feedback').select('id, company_id, subject, status, reply_history, user_email').eq('id', ticketId).maybeSingle()
      : { data: null };
    if (ticket) {
      const body = stripQuotedReply(mail.body);
      const entry = { direction: 'in', from: mail.from, message: body, received_at: new Date().toISOString() };
      const { error: fbErr } = await supabase.from('feedback').update({
        reply_history: [...((ticket.reply_history as unknown[]) || []), entry],
        status: ticket.status === 'resolved' ? 'new' : ticket.status,
      }).eq('id', ticket.id);
      if (fbErr) console.error('[inbound-email] could not file feedback reply:', fbErr.message);
      if (ticket.company_id != null) {
        const { error: nErr } = await supabase.from('company_notifications').insert({
          company_id: ticket.company_id,
          type: 'feedback_reply',
          title: `Reply on ticket: ${ticket.subject || '(no subject)'}`,
          message: `${mail.from} wrote: ${body.slice(0, 300)}`,
          metadata: { feedback_id: ticket.id, from_email: mail.from, source: 'inbound_email' },
          created_by: null,
        });
        if (nErr) console.error('[inbound-email] could not raise feedback-reply notification:', nErr.message);
      }
      console.log(`[inbound-email] reply from ${mail.from} filed on ticket ${ticket.id}`);
      return json({ ok: true, matched: true, kind: 'feedback', feedback_id: ticket.id });
    }
    console.warn(`[inbound-email] mail to a feedback address did not resolve to a ticket (${fbToken ? 'token did not verify' : 'no token'}) — handling as other mail`);
    kind = 'other';
  }

  let quote: QuoteCandidate | null = null;
  let reason = 'none';

  const token = tokenFromAddresses([mail.to, ...(mail.allRecipients || [])]);
  if (token && !REPLY_SECRET) {
    console.warn('[inbound-email] a reply token arrived but REPLY_TOKEN_SECRET is not set — falling back to sender matching');
  }
  if (token && REPLY_SECRET) {
    const tokenQuoteId = await parseReplyToken(token, REPLY_SECRET);
    if (tokenQuoteId) {
      const { data: byToken } = await supabase
        .from('quotes')
        .select('id, company_id, quote_id, sent_to_email, status, last_sent_at, sent_date, salesperson_id')
        .eq('id', tokenQuoteId)
        .maybeSingle();
      if (byToken) { quote = byToken as QuoteCandidate; reason = 'token'; }
    } else {
      // A token that does not verify is worth a line in the log: it is either a
      // probe or a sign the signing secret changed under us.
      console.warn('[inbound-email] reply token failed verification');
    }
  }

  // Candidates are estimates we actually mailed to this address.
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, company_id, quote_id, sent_to_email, status, last_sent_at, sent_date, salesperson_id')
    .ilike('sent_to_email', mail.from)
    .limit(50);

  if (!quote && kind !== 'other') {
    const m = matchInboundToEstimate(mail.from, mail.subject, (quotes || []) as QuoteCandidate[]);
    quote = m.quote;
    reason = m.reason;
  }

  if (!quote && kind === 'other') {
    // A reply to an invoice, a receipt, or a no-reply address, from someone we
    // know. It gets in front of a person; it does not get a home on an estimate
    // it was never about.
    const body = stripQuotedReply(mail.body);
    const companyId = (quotes || [])[0]?.company_id ?? null;
    if (companyId == null) {
      console.warn(`[inbound-email] mail to ${mail.to} from ${mail.from} (no tenant has mailed this address) — "${mail.subject}" ${body.slice(0, 200)}`);
      return json({ ok: true, matched: false, from: mail.from, reason: 'no_tenant' });
    }
    const { error: otherErr } = await supabase.from('company_notifications').insert({
      company_id: companyId,
      type: 'email_reply_unrouted',
      title: `Email reply to ${mail.to}`,
      message: `${mail.from} wrote "${mail.subject || '(no subject)'}": ${body.slice(0, 200)}`,
      metadata: { from_email: mail.from, to_email: mail.to, subject: mail.subject, body: body.slice(0, 2000), source: 'inbound_email' },
      created_by: null,
    });
    if (otherErr) console.error('[inbound-email] could not raise reply to', mail.to, otherErr.message);
    console.log(`[inbound-email] reply to ${mail.to} from ${mail.from} raised to company ${companyId}`);
    return json({ ok: true, matched: false, from: mail.from, reason: 'not_an_estimate_address' });
  }

  if (!quote) {
    // Raised, not binned. Nobody was mailed an estimate at this address, so
    // guessing which job it belongs to would put a stranger's words on somebody
    // else's estimate. A person decides instead.
    const body = stripQuotedReply(mail.body);
    const companyId = (quotes || [])[0]?.company_id ?? null;
    if (companyId == null) {
      // No tenant ever mailed this address, so there is no one to raise it
      // to — company_notifications.company_id is NOT NULL and the insert
      // used to fail here without a word. The log is the only home it has.
      console.warn(`[inbound-email] unmatched reply from ${mail.from} (no tenant has mailed this address) — subject "${mail.subject}" body: ${body.slice(0, 300)}`);
      return json({ ok: true, matched: false, from: mail.from, reason: 'no_tenant' });
    }
    const { error: unmatchedErr } = await supabase.from('company_notifications').insert({
      company_id: companyId,
      type: 'estimate_reply_unmatched',
      title: 'Email reply we could not place',
      message: `${mail.from} wrote "${mail.subject || '(no subject)'}" but no estimate was sent to that address.`,
      metadata: { from_email: mail.from, subject: mail.subject, body: body.slice(0, 2000), source: 'inbound_email' },
      created_by: null,
    });
    if (unmatchedErr) console.error('[inbound-email] could not raise unmatched reply:', unmatchedErr.message);
    console.log(`[inbound-email] unmatched reply from ${mail.from} raised to company ${companyId}`);
    return json({ ok: true, matched: false, from: mail.from });
  }

  const cleanBody = stripQuotedReply(mail.body);

  const { error: insErr } = await supabase.from('estimate_messages').insert({
    quote_id: quote.id,
    company_id: quote.company_id,
    from_role: 'customer',
    from_name: mail.from,
    from_email: mail.from,
    to_email: mail.to || null,
    channel: 'email',
    subject: mail.subject || null,
    body: cleanBody || '(empty reply)',
    is_internal: false,
    metadata: { matched_by: reason, provider_payload_keys: Object.keys(payload || {}) },
  });
  if (insErr) {
    console.error('[inbound-email] insert failed:', insErr.message);
    return json({ ok: false, error: insErr.message }, 500);
  }

  // Tell the rep — the same shape customer-portal-message already uses, so a
  // reply reads identically whether it arrived by portal or by email. The
  // owning rep travels in metadata.owner_employee_id; this table has no
  // employee_id column.
  const label = quote.quote_id || `EST-${quote.id}`;
  const snippet = cleanBody.length > 140 ? cleanBody.slice(0, 140) + '…' : cleanBody;
  const { error: notifyErr } = await supabase.from('company_notifications').insert({
    company_id: quote.company_id,
    type: 'estimate_reply',
    title: 'New reply on an estimate',
    message: `${mail.from} replied on ${label}: "${snippet}"`,
    metadata: {
      quote_id: quote.id,
      quote_number: quote.quote_id || null,
      owner_employee_id: quote.salesperson_id || null,
      from_name: mail.from,
      source: 'email_reply',
    },
    created_by: null,
  });
  // The message is already saved. A failed notification is worth knowing about
  // but must never turn a captured reply into a provider retry.
  if (notifyErr) console.error('[inbound-email] notification failed:', notifyErr.message);

  // And the rep's inbox — reps live in the field, and the reply used to land
  // in a mailbox they read. It still does: reply_to is the customer, so
  // answering from the inbox goes straight back to them.
  const escaped = cleanBody.replace(/[<>]/g, (c) => c === '<' ? '&lt;' : '&gt;');
  const emailRes = await emailRep(supabase, {
    salespersonId: quote.salesperson_id || null,
    replyTo: mail.from,
    subject: `Reply from ${mail.from} on ${label}`,
    html: repEmailShell(
      'New reply on your estimate',
      `<p style="font-size:15px;margin:0 0 10px"><b>${mail.from}</b> replied on estimate <b>${label}</b>${mail.subject ? ` — <i>${mail.subject.replace(/[<>]/g, '')}</i>` : ''}:</p>`
      + `<blockquote style="margin:0;padding:10px 14px;background:#f7f5ef;border-left:3px solid #5a6349;border-radius:6px;font-size:14px;white-space:pre-wrap">${escaped || '(empty reply)'}</blockquote>`,
      appLink(`/estimates/${quote.id}`), 'Open in JobScout',
    ),
  });
  if (!emailRes.sent) console.log('[inbound-email] rep email skipped:', emailRes.skipped || emailRes.error);

  console.log(`[inbound-email] ${mail.from} -> estimate ${quote.id} (${reason})`);
  return json({ ok: true, matched: true, quote_id: quote.id, matched_by: reason });
});
