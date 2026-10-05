// A company's text-message terms, public.
//
// Routes:  /sms-terms/:slug   (names the business)
//          /sms-terms         (generic, still correct)
//
// This page exists because registering for A2P 10DLC asks for a URL showing
// what recipients agreed to, and there was nowhere to point. It is opened by a
// carrier reviewer who is not logged in, so it must render with no session, no
// tenant context and no theme — hence the literal colours, same as /terms.
//
// Per company, not per platform: each tenant registers its own brand, and a
// reviewer matches the disclosure against that brand. The name comes from
// public-company-card (public, exact slug match) and the page renders correctly
// without it, because a terms URL that can break is worse than a plain one.

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { consentDisclosure } from '../lib/smsConsent'

const PAGE = {
  minHeight: '100vh', backgroundColor: '#f7f5ef', padding: '32px 24px',
  maxWidth: 760, margin: '0 auto', fontFamily: 'system-ui, sans-serif',
}
const h2 = { fontSize: 18, fontWeight: 700, color: '#2c3530', marginTop: 28, marginBottom: 8 }
const para = { fontSize: 14, color: '#4d5a52', lineHeight: 1.7, marginBottom: 12 }
const list = { fontSize: 14, color: '#4d5a52', lineHeight: 1.7, marginBottom: 12, paddingLeft: 20 }
const callout = {
  ...para, backgroundColor: '#fff', border: '1px solid #d6cdb8', borderRadius: 10,
  padding: '14px 16px', marginBottom: 0,
}

export default function SmsTerms() {
  const { slug } = useParams()
  const [company, setCompany] = useState(null)

  useEffect(() => {
    if (!slug) return
    let live = true
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-company-card?slug=${encodeURIComponent(slug)}`
    // Unauthenticated on purpose. A failure leaves the generic wording in
    // place rather than showing an error on a page someone is reviewing.
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d && !d.error) setCompany(d) })
      .catch(() => {})
    return () => { live = false }
  }, [slug])

  const name = company?.company_name || null
  const who = name || 'the company you do business with'
  const legal = company?.legal_name && company.legal_name !== name ? company.legal_name : null

  return (
    <div style={PAGE}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#2c3530', margin: '0 0 4px' }}>
        Text message terms
      </h1>
      <p style={{ fontSize: 13, color: '#7d8a7f', marginBottom: 24 }}>
        {name ? <>For customers and staff of <strong style={{ color: '#4d5a52' }}>{name}</strong>{legal ? ` (${legal})` : ''}</> : 'For customers and staff of businesses using JobScout'}
      </p>

      <div style={callout}>
        <strong style={{ color: '#2c3530' }}>What you agreed to:</strong><br />
        {consentDisclosure(name)}
      </div>

      <h2 style={h2}>Who sends these messages</h2>
      <p style={para}>
        Texts come from {who}, sent through JobScout, the job management software
        they use to run their business. JobScout does not text you for its own
        purposes and does not sell or share your number.
      </p>

      <h2 style={h2}>What we text you about</h2>
      <ul style={list}>
        <li><strong>Estimates</strong> — a quote you asked for, and follow-ups on it.</li>
        <li><strong>Appointments and jobs</strong> — confirmations, reminders, and when a crew is on the way.</li>
        <li><strong>Invoices and payments</strong> — an invoice is ready, a payment landed, or a balance is past due.</li>
        <li><strong>Staff messages</strong> — if you work there: onboarding links, schedule notes and alerts about your own jobs.</li>
      </ul>
      <p style={para}>
        These are messages about work you have asked for or are already doing
        with us. We do not send promotions by text unless you have separately
        agreed to receive them.
      </p>

      <h2 style={h2}>How often</h2>
      <p style={para}>
        Message frequency varies — it follows your jobs. Most people get a few
        messages around a single job and nothing in between.
      </p>

      <h2 style={h2}>Cost</h2>
      <p style={para}>
        Message and data rates may apply, depending on your mobile plan. We do
        not charge you anything for a text.
      </p>

      <h2 style={h2}>How to stop</h2>
      <p style={para}>
        Reply <strong>STOP</strong> to any message and the texts stop. Your
        carrier confirms it and nothing further is sent to that number. You can
        also simply ask us, and we will turn it off.
      </p>
      <p style={para}>
        Stopping texts does not cancel your work with us, and agreeing to texts
        was never a condition of buying anything. We may still reach you by
        phone or email about your jobs.
      </p>

      <h2 style={h2}>How to get help</h2>
      <p style={para}>
        Reply <strong>HELP</strong> to any message{company?.phone ? <> or call {company.phone}</> : ''}
        {company?.website ? <> — more at {company.website}</> : ''}.
      </p>

      <h2 style={h2}>Carriers</h2>
      <p style={para}>
        Mobile carriers are not liable for delayed or undelivered messages.
        Delivery depends on your carrier and your phone.
      </p>

      <h2 style={h2}>Your information</h2>
      <p style={para}>
        We use your phone number to send the messages described here and for
        nothing else. We do not sell it, and we do not share it with anyone
        except the messaging provider that carries the text. More in the{' '}
        <Link to="/privacy" style={{ color: '#5a6349' }}>privacy policy</Link>.
      </p>

      <p style={{ fontSize: 12, color: '#7d8a7f', marginTop: 32, borderTop: '1px solid #d6cdb8', paddingTop: 16 }}>
        Messages sent via JobScout by AppsAnnex on behalf of {who}.
      </p>
    </div>
  )
}
