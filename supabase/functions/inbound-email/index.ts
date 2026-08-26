import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  matchInboundToEstimate, normalizeEmail, stripQuotedReply, type QuoteCandidate,
} from "../_shared/inboundMatch.ts";
import { parseReplyToken, tokenFromAddresses } from "../_shared/replyToken.ts";

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

// Pull from/subject/body out of whatever the provider sent.
function readEmail(payload: Record<string, any>) {
  const d = payload?.data ?? payload ?? {};
  const from =
    d.from?.address ?? d.from?.email ?? (typeof d.from === 'string' ? d.from : null) ??
    d.sender ?? d.envelope?.from ?? payload?.from ?? null;
  const subject = d.subject ?? payload?.subject ?? '';
  const body =
    d.text ?? d['body-plain'] ?? d.plain ?? d.textBody ?? d.body ??
    d.html ?? d['body-html'] ?? d.htmlBody ?? '';
  const to =
    d.to?.[0]?.address ?? d.to?.[0]?.email ?? (typeof d.to === 'string' ? d.to : null) ??
    d.recipient ?? payload?.to ?? null;
  const allRecipients = [
    ...(Array.isArray(d.to) ? d.to : []),
    ...(Array.isArray(d.cc) ? d.cc : []),
  ].map((x: any) => normalizeEmail(x?.address ?? x?.email ?? x));
  return { from: normalizeEmail(from), subject: String(subject || ''), body: String(body || ''), to: normalizeEmail(to), allRecipients };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let payload: Record<string, any> = {};
  try { payload = await req.json(); } catch { /* fall through to a 200 below */ }

  const mail = readEmail(payload);

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

  if (!quote) {
    const m = matchInboundToEstimate(mail.from, mail.subject, (quotes || []) as QuoteCandidate[]);
    quote = m.quote;
    reason = m.reason;
  }

  if (!quote) {
    // Raised, not binned. Nobody was mailed an estimate at this address, so
    // guessing which job it belongs to would put a stranger's words on somebody
    // else's estimate. A person decides instead.
    const body = stripQuotedReply(mail.body);
    await supabase.from('company_notifications').insert({
      company_id: (quotes || [])[0]?.company_id ?? null,
      type: 'estimate_reply_unmatched',
      title: 'Email reply we could not place',
      message: `${mail.from} wrote "${mail.subject || '(no subject)'}" but no estimate was sent to that address.`,
      metadata: { from_email: mail.from, subject: mail.subject, body: body.slice(0, 2000), source: 'inbound_email' },
      created_by: null,
    });
    console.log(`[inbound-email] unmatched reply from ${mail.from}`);
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

  console.log(`[inbound-email] ${mail.from} -> estimate ${quote.id} (${reason})`);
  return json({ ok: true, matched: true, quote_id: quote.id, matched_by: reason });
});
