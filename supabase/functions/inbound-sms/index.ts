// Texts that arrive.
//
// JobScout could send a text and never receive one. A customer replying to an
// invoice reminder got silence: the number's inbound webhook still pointed at
// Twilio's demo autoresponder from account setup, and once the number joined a
// Messaging Service the service's inbound URL took over — and was null, so the
// reply was dropped before anything could look at it. Same shape of hole the
// inbound EMAIL work closed in September.
//
// This takes Twilio's webhook, works out who texted, writes the message onto
// the communications log where /communications and the customer page already
// read, and tells the rep whose customer it is. A STOP clears their consent.
//
// Public by necessity — Twilio cannot send a Supabase JWT — so it must be
// deployed with --no-verify-jwt and is pinned in config.toml, or a routine
// redeploy turns it off and replies start vanishing again. Being public, it
// verifies Twilio's signature on every request before it writes anything.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMPTY_TWIML, phoneKey, samePhone, keywordOf, pickMatch, inboundLogRow,
  inboundNotification, inboundRecipients, signatureBase, safeEqual, type Match,
} from "../_shared/inboundSms.ts";
import { managerIds } from "../_shared/marketing.ts";

// Twilio reads the status code, not the body. Always answer 200 with empty
// TwiML once the request is proven genuine: a non-2xx makes Twilio retry, and
// a retry of something we already stored is just noise.
const twiml = (status = 200) =>
  new Response(EMPTY_TWIML, { status, headers: { 'Content-Type': 'text/xml' } });

async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = String(v);

    const from = params.From || '';
    const to = params.To || '';
    const body = params.Body || '';
    const messageSid = params.MessageSid || params.SmsMessageSid || '';

    if (!from || !to) {
      console.error('[inbound-sms] no From/To in payload');
      return twiml(400);
    }

    // Which tenant owns the number it was sent TO. Every company keeps its own
    // Twilio credentials, so this has to be answered before the signature can
    // be checked — there is no single account key to check against.
    const { data: configs, error: cfgErr } = await sb
      .from('settings').select('company_id, value').eq('key', 'twilio_config');
    if (cfgErr) {
      console.error('[inbound-sms] settings read failed:', cfgErr.message);
      return twiml(500);
    }

    let companyId: number | null = null;
    let authToken = '';
    for (const row of configs || []) {
      let cfg: Record<string, string>;
      try { cfg = JSON.parse(row.value); } catch { continue; }
      if (samePhone(cfg.from_number, to)) {
        companyId = row.company_id;
        authToken = cfg.auth_token || '';
        break;
      }
    }
    if (!companyId || !authToken) {
      // Not ours, or configured without a token. Say 200: Twilio retrying a
      // message for a number we do not host achieves nothing.
      console.warn('[inbound-sms] no company owns', phoneKey(to));
      return twiml(200);
    }

    // Prove it came from Twilio before writing a single row. Without this,
    // anyone who can POST a form could file messages into a company's log and
    // raise notifications naming whoever they liked.
    const signature = req.headers.get('x-twilio-signature') || '';
    // Twilio signs the URL it was configured with. Behind Supabase's gateway
    // the inbound request URL is the public function URL, which is what we
    // reconstruct here.
    const url = `${SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co')}/inbound-sms`;
    const expected = await hmacSha1Base64(authToken, signatureBase(url, params));
    if (!signature || !safeEqual(signature, expected)) {
      // Also allow the plain /functions/v1/ form, since either can be what is
      // registered in Twilio and the signature covers the exact string.
      const altUrl = `${SUPABASE_URL}/functions/v1/inbound-sms`;
      const altExpected = await hmacSha1Base64(authToken, signatureBase(altUrl, params));
      if (!signature || !safeEqual(signature, altExpected)) {
        console.error('[inbound-sms] signature mismatch for company', companyId);
        return twiml(403);
      }
    }

    // A retry of something already stored is a no-op. The unique index on
    // (company_id, communication_id) is the backstop; this is the cheap check.
    if (messageSid) {
      const { data: seen } = await sb.from('communications_log')
        .select('id').eq('company_id', companyId).eq('communication_id', messageSid).limit(1);
      if (seen && seen.length) return twiml(200);
    }

    // Who texted.
    const { data: matchRows, error: matchErr } = await sb
      .rpc('inbound_sms_match', { p_company_id: companyId, p_phone: from });
    if (matchErr) console.error('[inbound-sms] match failed:', matchErr.message);
    const match: Match = pickMatch(matchRows || []);

    // The record. A failure is logged, never swallowed — an insert that names
    // columns the table does not have is how outbound texts went unlogged for
    // months.
    const { error: logErr } = await sb.from('communications_log')
      .insert(inboundLogRow({ companyId, from, body, messageSid, match }));
    if (logErr) console.error('[inbound-sms] communications_log insert failed:', logErr.message);

    // STOP means stop. Twilio handles the carrier side itself, but if the word
    // reaches us then our consent record must not keep saying yes for someone
    // who has just said no. START puts it back, dated today, because that is
    // when they said it.
    const keyword = keywordOf(body);
    if (match.kind === 'customer' && match.id && (keyword === 'stop' || keyword === 'start')) {
      const consent = keyword === 'start'
        ? { sms_consent: true, sms_consent_at: new Date().toISOString(), sms_consent_source: 'portal' }
        : { sms_consent: false, sms_consent_at: null, sms_consent_source: null };
      const { error: cErr } = await sb.from('customers').update(consent).eq('id', match.id);
      if (cErr) console.error('[inbound-sms] consent update failed:', cErr.message);
    }

    // Tell someone. A keyword is not a message a person needs to read.
    if (!keyword) {
      const note = inboundNotification({ from, body, messageSid, match });
      let ids = inboundRecipients(match, await managerIds(sb, companyId));
      if (ids.length) {
        // The dedupe index is partial (dedupe_key IS NOT NULL), which
        // ON CONFLICT cannot infer through PostgREST, so dedupe by hand.
        const { data: had } = await sb.from('employee_notifications')
          .select('employee_id').eq('company_id', companyId)
          .eq('dedupe_key', note.dedupe_key).in('employee_id', ids);
        const seen = new Set((had || []).map((r: { employee_id: number }) => r.employee_id));
        ids = ids.filter((id) => !seen.has(id));
      }
      if (ids.length) {
        const { error: nErr } = await sb.from('employee_notifications').insert(
          ids.map((employee_id) => ({
            company_id: companyId, employee_id,
            type: note.type, title: note.title, message: note.message,
            route: note.route, metadata: note.metadata, dedupe_key: note.dedupe_key,
          })),
        );
        if (nErr) console.error('[inbound-sms] notification insert failed:', nErr.message);
      }
    }

    return twiml(200);

  } catch (error) {
    console.error('[inbound-sms] error:', error);
    return twiml(500);
  }
});
