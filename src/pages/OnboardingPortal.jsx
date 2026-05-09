// OnboardingPortal — public, token-gated. The new hire opens their
// magic link on their phone and walks through:
//   1. Welcome
//   2. Personal info
//   3. Tax info (W-4) — with a "what this means for your paycheck" card
//   4. State withholding (Utah: noop / federal-uses; other states: form)
//   5. Direct deposit
//   6. SSN + sign + finalize
//
// No login. The token in the URL grants access to one packet.
//
// All recommendations come from the live payrollTax.js engine, so the
// employee sees the exact dollar amount that will come out of their
// next paycheck before they sign.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { calcPaystubTax, normalizePayFrequency } from '../lib/payrollTax'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY

const theme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentHover: '#4a5239', accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e', warning: '#eab308', error: '#dc2626',
}

async function rpc(action, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/employee-onboarding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json()
  if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

export default function OnboardingPortal() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [packet, setPacket]   = useState(null)
  const [employee, setEmployee] = useState(null)
  const [company, setCompany] = useState(null)
  const [step, setStep]       = useState(0) // 0 = welcome
  const [draft, setDraft]     = useState({})

  useEffect(() => {
    (async () => {
      try {
        const data = await rpc('load', { token })
        setPacket(data.packet)
        setEmployee(data.employee)
        setCompany(data.company)
        setDraft(data.packet?.draft_data || {})
        // Auto-advance past welcome if they've already completed step 1
        if (data.packet?.step_completion?.personal) setStep(1)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  const updateStep = async (key, payload) => {
    setDraft(prev => ({ ...prev, [key]: payload }))
    try { await rpc('save', { token, step: key, data: payload }) }
    catch (err) { console.warn('save failed:', err.message) }
  }

  if (loading) return <Centered>Loading your onboarding…</Centered>
  if (error)   return <Centered tone="error">{error}</Centered>
  if (!packet) return <Centered tone="error">Link not found.</Centered>

  if (packet.status === 'completed') {
    return (
      <Centered>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h1 style={{ color: theme.text, marginBottom: 8 }}>You're all set, {employee?.name?.split(' ')[0]}!</h1>
          <p style={{ color: theme.textSecondary }}>
            We received everything. {company?.company_name} will reach out if anything else is needed.
          </p>
        </div>
      </Centered>
    )
  }

  const STEPS = [
    { key: 'welcome',         label: 'Welcome' },
    { key: 'personal',        label: 'About you' },
    { key: 'w4',              label: 'Tax info' },
    { key: 'direct_deposit',  label: 'Direct deposit' },
    { key: 'i9_section1',     label: 'Eligibility' },
    { key: 'sign',            label: 'Sign + finish' },
  ]
  const currentStep = STEPS[step]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, padding: '20px 16px 40px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          {company?.logo_url && (
            <img src={company.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
          )}
          <div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{company?.company_name}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Welcome aboard, {employee?.name?.split(' ')[0]}</div>
          </div>
        </div>

        {/* Progress */}
        <ProgressDots count={STEPS.length} active={step} onJump={(i) => setStep(i)} />

        {/* Step content */}
        <div style={{ marginTop: 20, padding: 20, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14 }}>
          {currentStep.key === 'welcome' && (
            <WelcomeStep employee={employee} company={company} onNext={() => setStep(1)} />
          )}
          {currentStep.key === 'personal' && (
            <PersonalStep
              draft={draft.personal}
              employee={employee}
              onSave={(d) => updateStep('personal', d)}
              onBack={() => setStep(step - 1)}
              onNext={() => setStep(step + 1)}
            />
          )}
          {currentStep.key === 'w4' && (
            <W4Step
              draft={draft.w4}
              hourlyHint={employee}
              onSave={(d) => updateStep('w4', d)}
              onBack={() => setStep(step - 1)}
              onNext={() => setStep(step + 1)}
            />
          )}
          {currentStep.key === 'direct_deposit' && (
            <DirectDepositStep
              draft={draft.direct_deposit}
              onSave={(d) => updateStep('direct_deposit', d)}
              onBack={() => setStep(step - 1)}
              onNext={() => setStep(step + 1)}
            />
          )}
          {currentStep.key === 'i9_section1' && (
            <I9Step
              draft={draft.i9_section1}
              employee={employee}
              onSave={(d) => updateStep('i9_section1', d)}
              onBack={() => setStep(step - 1)}
              onNext={() => setStep(step + 1)}
            />
          )}
          {currentStep.key === 'sign' && (
            <SignStep
              token={token}
              draft={draft}
              employee={employee}
              company={company}
              onBack={() => setStep(step - 1)}
              onDone={() => window.location.reload()}
            />
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: theme.textMuted }}>
          Powered by JobScout · This page is private to you · {company?.company_name}
        </div>
      </div>
    </div>
  )
}

// ===== Step components ===============================================
function WelcomeStep({ employee, company, onNext }) {
  return (
    <div>
      <h2 style={{ color: theme.text, marginTop: 0 }}>Hi {employee?.name?.split(' ')[0]} 👋</h2>
      <p style={{ color: theme.textSecondary, lineHeight: 1.55 }}>
        We're excited to have you at {company?.company_name}. This takes about 15 minutes —
        you can do the whole thing right here on your phone.
      </p>
      <p style={{ color: theme.textSecondary, lineHeight: 1.55 }}>
        Have these handy:
      </p>
      <ul style={{ color: theme.textSecondary, lineHeight: 1.7 }}>
        <li>A photo ID (driver's license, passport, etc.)</li>
        <li>Your Social Security Number</li>
        <li>A voided check OR your bank routing + account number</li>
      </ul>
      <BigButton onClick={onNext}>Get started →</BigButton>
    </div>
  )
}

function PersonalStep({ draft = {}, employee, onSave, onBack, onNext }) {
  const [v, setV] = useState({
    phone: draft.phone || employee?.phone || '',
    date_of_birth: draft.date_of_birth || '',
    home_address: draft.home_address || '',
    home_city: draft.home_city || '',
    home_state: draft.home_state || 'UT',
    home_zip: draft.home_zip || '',
    emergency_contact_name: draft.emergency_contact_name || '',
    emergency_contact_phone: draft.emergency_contact_phone || '',
  })
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }))
  const valid = v.phone && v.date_of_birth && v.home_address && v.home_city && v.home_state && v.home_zip

  return (
    <div>
      <h2 style={{ color: theme.text, marginTop: 0 }}>About you</h2>
      <p style={{ color: theme.textMuted, fontSize: 14 }}>So we have your info on file.</p>

      <Field label="Phone">
        <input type="tel" value={v.phone} onChange={set('phone')} style={inp} />
      </Field>
      <Field label="Date of birth">
        <input type="date" value={v.date_of_birth} onChange={set('date_of_birth')} style={inp} />
      </Field>
      <Field label="Home street address">
        <input type="text" value={v.home_address} onChange={set('home_address')} style={inp} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
        <Field label="City"><input type="text" value={v.home_city} onChange={set('home_city')} style={inp} /></Field>
        <Field label="State"><input type="text" maxLength={2} value={v.home_state} onChange={set('home_state')} style={inp} /></Field>
        <Field label="ZIP"><input type="text" value={v.home_zip} onChange={set('home_zip')} style={inp} /></Field>
      </div>

      <h3 style={{ color: theme.text, marginTop: 20, fontSize: 15 }}>Emergency contact</h3>
      <Field label="Name"><input type="text" value={v.emergency_contact_name} onChange={set('emergency_contact_name')} style={inp} /></Field>
      <Field label="Phone"><input type="tel" value={v.emergency_contact_phone} onChange={set('emergency_contact_phone')} style={inp} /></Field>

      <NavButtons
        onBack={onBack}
        nextDisabled={!valid}
        nextLabel="Continue →"
        onNext={async () => { await onSave(v); onNext() }}
      />
    </div>
  )
}

function W4Step({ draft = {}, hourlyHint, onSave, onBack, onNext }) {
  const [v, setV] = useState({
    filing_status: draft.filing_status || '',
    multiple_jobs: !!draft.multiple_jobs,
    dependents_amount: draft.dependents_amount || 0,
    other_income: draft.other_income || 0,
    deductions: draft.deductions || 0,
    extra_withholding: draft.extra_withholding || 0,
  })
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }))
  const setBool = (k) => (e) => setV(p => ({ ...p, [k]: e.target.checked }))
  const valid = !!v.filing_status

  // Live recommendation — runs the engine on a hypothetical paycheck
  // so the new hire sees roughly what'll come out before they sign.
  const recommendation = useMemo(() => {
    if (!v.filing_status) return null
    // Estimate the gross — 80h biweekly at $25/hr if we don't know
    const gross = 2000
    const result = calcPaystubTax({
      employee: {
        w4_filing_status: v.filing_status,
        w4_multiple_jobs: v.multiple_jobs,
        w4_dependents_amount: Number(v.dependents_amount) || 0,
        w4_other_income: Number(v.other_income) || 0,
        w4_deductions: Number(v.deductions) || 0,
        w4_extra_withholding: Number(v.extra_withholding) || 0,
      },
      company: { sui_rate_pct: 1.2, state_employer_id_state: 'UT' },
      gross,
      ytd: { gross: 0, ssWages: 0, medicareWages: 0 },
      payFrequency: 'bi-weekly',
    })
    return { gross, ...result }
  }, [v])

  return (
    <div>
      <h2 style={{ color: theme.text, marginTop: 0 }}>Tax info (W-4)</h2>
      <p style={{ color: theme.textMuted, fontSize: 14 }}>
        Five quick questions. We use these to figure out how much federal tax to take out of every paycheck.
      </p>

      <Field label="How do you file your taxes?">
        <select value={v.filing_status} onChange={set('filing_status')} style={inp}>
          <option value="">— Pick one —</option>
          <option value="single">Single (or married filing separately)</option>
          <option value="married_jointly">Married filing jointly</option>
          <option value="head_of_household">Head of household</option>
        </select>
      </Field>

      <CheckRow
        checked={v.multiple_jobs}
        onChange={setBool('multiple_jobs')}
        label="I have a second job, or my spouse works"
        sub="(Tells the IRS to withhold more so you don't owe at tax time)"
      />

      <Field label="How many dependents do you claim?" help="Most common: $2,000 per child under 17, $500 per other dependent">
        <select value={String(v.dependents_amount)} onChange={set('dependents_amount')} style={inp}>
          <option value="0">None — $0</option>
          <option value="2000">1 kid — $2,000</option>
          <option value="4000">2 kids — $4,000</option>
          <option value="6000">3 kids — $6,000</option>
          <option value="8000">4 kids — $8,000</option>
        </select>
      </Field>

      <details style={{ marginTop: 14, padding: 12, backgroundColor: theme.bg, borderRadius: 10 }}>
        <summary style={{ cursor: 'pointer', color: theme.accent, fontWeight: 600, fontSize: 13 }}>
          More options (most people skip these)
        </summary>
        <div style={{ marginTop: 12 }}>
          <Field label="Other income per year (interest, side gig, etc.)">
            <input type="number" step="100" value={v.other_income} onChange={set('other_income')} style={inp} />
          </Field>
          <Field label="Itemized deductions per year (above the standard)">
            <input type="number" step="100" value={v.deductions} onChange={set('deductions')} style={inp} />
          </Field>
          <Field label="Extra federal tax to take out of every paycheck">
            <input type="number" step="5" value={v.extra_withholding} onChange={set('extra_withholding')} style={inp} />
          </Field>
        </div>
      </details>

      {recommendation && (
        <div style={{
          marginTop: 16, padding: 14,
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.30)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 700, marginBottom: 6 }}>
            What this means for your paycheck
          </div>
          <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.55 }}>
            On a typical $2,000 biweekly paycheck:
            <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
              <li>Federal tax: <strong>${recommendation.federalIncomeTax.toFixed(2)}</strong></li>
              <li>Social Security: <strong>${recommendation.socialSecurityEmployee.toFixed(2)}</strong></li>
              <li>Medicare: <strong>${recommendation.medicareEmployee.toFixed(2)}</strong></li>
              <li>Utah state tax: <strong>${recommendation.stateIncomeTax.toFixed(2)}</strong></li>
            </ul>
            <strong style={{ color: theme.text }}>Take-home: about ${recommendation.netPay.toFixed(2)}</strong>
            <div style={{ marginTop: 8, fontSize: 12, color: theme.textMuted }}>
              Your actual paycheck will scale with your hours + rate. If you usually owe at tax time, set "Extra federal tax" higher. If you usually get a big refund, you can lower it.
            </div>
          </div>
        </div>
      )}

      <NavButtons
        onBack={onBack}
        nextDisabled={!valid}
        nextLabel="Continue →"
        onNext={async () => { await onSave(v); onNext() }}
      />
    </div>
  )
}

function DirectDepositStep({ draft = {}, onSave, onBack, onNext }) {
  const [v, setV] = useState({
    enable: draft.enable !== false,
    account_type: draft.account_type || 'checking',
    routing_number: draft.routing_number || '',
    account_number: draft.account_number || '',
    confirm_account: draft.account_number || '',
  })
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }))

  const accountsMatch = v.account_number && v.account_number === v.confirm_account
  const validRouting = (v.routing_number || '').replace(/\D/g, '').length === 9
  const valid = !v.enable || (validRouting && accountsMatch)

  return (
    <div>
      <h2 style={{ color: theme.text, marginTop: 0 }}>Direct deposit</h2>
      <p style={{ color: theme.textMuted, fontSize: 14 }}>
        Get paid faster. Skip this if you'd rather receive a paper check.
      </p>

      <CheckRow
        checked={v.enable}
        onChange={(e) => setV(p => ({ ...p, enable: e.target.checked }))}
        label="Yes, set up direct deposit"
        sub="Check the next page of your checkbook for the routing + account numbers"
      />

      {v.enable && (
        <>
          <Field label="Account type">
            <select value={v.account_type} onChange={set('account_type')} style={inp}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </Field>
          <Field label="Routing number (9 digits)" help="Bottom-left of your check, between two ⑈ symbols">
            <input type="text" inputMode="numeric" value={v.routing_number} onChange={set('routing_number')} maxLength={9} style={inp} />
          </Field>
          <Field label="Account number">
            <input type="text" inputMode="numeric" value={v.account_number} onChange={set('account_number')} style={inp} />
          </Field>
          <Field label="Confirm account number">
            <input type="text" inputMode="numeric" value={v.confirm_account} onChange={set('confirm_account')} style={inp} />
            {v.confirm_account && !accountsMatch && (
              <div style={{ color: theme.error, fontSize: 12, marginTop: 4 }}>Doesn't match the number above.</div>
            )}
          </Field>
        </>
      )}

      <NavButtons
        onBack={onBack}
        nextDisabled={!valid}
        nextLabel="Continue →"
        onNext={async () => { await onSave(v); onNext() }}
      />
    </div>
  )
}

function I9Step({ draft = {}, employee, onSave, onBack, onNext }) {
  const [v, setV] = useState({
    citizenship: draft.citizenship || '',
    alien_number: draft.alien_number || '',
    work_auth_expires: draft.work_auth_expires || '',
    attest_truthful: !!draft.attest_truthful,
  })
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }))
  const valid = v.citizenship && v.attest_truthful &&
    (v.citizenship === 'us_citizen' || v.citizenship === 'noncitizen_national' ||
     (v.citizenship === 'permanent_resident' && v.alien_number) ||
     (v.citizenship === 'authorized_alien' && v.alien_number && v.work_auth_expires))

  return (
    <div>
      <h2 style={{ color: theme.text, marginTop: 0 }}>Eligibility to work (I-9)</h2>
      <p style={{ color: theme.textMuted, fontSize: 14 }}>
        Federal law requires this. We'll inspect your physical ID in person within your first 3 days — this just captures your part.
      </p>

      <Field label="Your status">
        <select value={v.citizenship} onChange={set('citizenship')} style={inp}>
          <option value="">— Pick one —</option>
          <option value="us_citizen">U.S. citizen</option>
          <option value="noncitizen_national">Noncitizen national of the U.S.</option>
          <option value="permanent_resident">Lawful permanent resident</option>
          <option value="authorized_alien">Alien authorized to work</option>
        </select>
      </Field>

      {(v.citizenship === 'permanent_resident' || v.citizenship === 'authorized_alien') && (
        <Field label="USCIS or A-Number">
          <input type="text" value={v.alien_number} onChange={set('alien_number')} style={inp} />
        </Field>
      )}
      {v.citizenship === 'authorized_alien' && (
        <Field label="Work authorization expiration date">
          <input type="date" value={v.work_auth_expires} onChange={set('work_auth_expires')} style={inp} />
        </Field>
      )}

      <CheckRow
        checked={v.attest_truthful}
        onChange={(e) => setV(p => ({ ...p, attest_truthful: e.target.checked }))}
        label="I attest under penalty of perjury that the information above is true and correct."
      />

      <NavButtons
        onBack={onBack}
        nextDisabled={!valid}
        nextLabel="Continue →"
        onNext={async () => { await onSave(v); onNext() }}
      />
    </div>
  )
}

function SignStep({ token, draft, employee, company, onBack, onDone }) {
  const [ssn, setSsn]     = useState('')
  const [typedName, setTypedName] = useState(employee?.name || '')
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [err, setErr]      = useState('')
  const padRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPtRef  = useRef({ x: 0, y: 0 })

  // Signature pad
  useEffect(() => {
    const c = padRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    // Hi-DPI scaling
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111827'

    const getPt = (e) => {
      const r = c.getBoundingClientRect()
      const t = e.touches?.[0] || e
      return { x: t.clientX - r.left, y: t.clientY - r.top }
    }
    const start = (e) => { e.preventDefault(); drawingRef.current = true; lastPtRef.current = getPt(e) }
    const move  = (e) => {
      if (!drawingRef.current) return
      e.preventDefault()
      const p = getPt(e)
      ctx.beginPath()
      ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      lastPtRef.current = p
    }
    const end = () => { drawingRef.current = false }

    c.addEventListener('mousedown', start);  c.addEventListener('mousemove', move);  window.addEventListener('mouseup', end)
    c.addEventListener('touchstart', start, { passive: false })
    c.addEventListener('touchmove', move, { passive: false })
    c.addEventListener('touchend', end)
    return () => {
      c.removeEventListener('mousedown', start); c.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end)
      c.removeEventListener('touchstart', start); c.removeEventListener('touchmove', move); c.removeEventListener('touchend', end)
    }
  }, [])

  const clearSig = () => {
    const c = padRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
  }

  const submit = async () => {
    setErr('')
    const digits = ssn.replace(/\D/g, '')
    if (digits.length !== 9) { setErr('SSN must be 9 digits.'); return }
    if (!typedName.trim())   { setErr('Type your full name.'); return }
    if (!agreed)             { setErr('You must check the consent box.'); return }
    setSigning(true)
    try {
      const sigImg = padRef.current?.toDataURL('image/png')
      // Save SSN + sign each form
      await rpc('save', { token, step: 'ssn', data: { value: digits } })
      const consent = `I, ${typedName.trim()}, agree that this electronic signature has the same legal effect as a handwritten one, and that the information I have provided is true and correct under penalty of perjury.`
      const sigPayloads = [
        { document_kind: 'w4',                 document_label: 'Form W-4 (2025)',          values_snapshot: draft.w4 || {} },
        { document_kind: 'i9_section1',        document_label: 'Form I-9 Section 1',       values_snapshot: draft.i9_section1 || {} },
        { document_kind: 'direct_deposit_auth',document_label: 'Direct Deposit Auth',      values_snapshot: draft.direct_deposit || {} },
        { document_kind: 'emergency_contact',  document_label: 'Emergency Contact',        values_snapshot: { name: draft.personal?.emergency_contact_name, phone: draft.personal?.emergency_contact_phone } },
      ]
      for (const p of sigPayloads) {
        await rpc('sign', {
          token, ...p,
          signature_typed_name: typedName.trim(),
          signature_image_base64: sigImg,
          consent_text: consent,
        })
      }
      await rpc('finalize', { token })
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSigning(false)
    }
  }

  return (
    <div>
      <h2 style={{ color: theme.text, marginTop: 0 }}>Last step — sign + finish</h2>

      <Field label="Your Social Security Number" help="Encrypted as soon as you submit. We need it for your W-2 at year-end.">
        <input type="text" inputMode="numeric" value={ssn} onChange={(e) => setSsn(e.target.value)} placeholder="XXX-XX-XXXX" autoComplete="off" style={inp} />
      </Field>

      <Field label="Type your full legal name">
        <input type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)} style={inp} />
      </Field>

      <div style={{ marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: 600, color: theme.textSecondary }}>Sign here</div>
      <div style={{ position: 'relative', border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: '#fff' }}>
        <canvas ref={padRef} style={{ width: '100%', height: 160, touchAction: 'none', display: 'block', borderRadius: 10 }} />
        <button onClick={clearSig} style={{
          position: 'absolute', top: 8, right: 8,
          padding: '6px 10px', fontSize: 12,
          background: 'transparent', border: `1px solid ${theme.border}`,
          color: theme.textMuted, borderRadius: 6, cursor: 'pointer',
        }}>Clear</button>
      </div>

      <CheckRow
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        label="I agree that this electronic signature has the same legal effect as a handwritten one. The information I provided is true and correct."
      />

      {err && <div style={{ color: theme.error, fontSize: 13, marginTop: 8 }}>{err}</div>}

      <NavButtons
        onBack={onBack}
        nextDisabled={signing}
        nextLabel={signing ? 'Submitting…' : 'Submit + finish'}
        onNext={submit}
      />
    </div>
  )
}

// ===== Tiny shared components ========================================
const inp = {
  width: '100%', padding: '12px 14px',
  border: `1px solid ${theme.border}`, borderRadius: 10,
  fontSize: 16, color: theme.text, WebkitTextFillColor: theme.text,
  backgroundColor: '#fff', boxSizing: 'border-box', outline: 'none',
}

function Field({ label, help, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 6 }}>{label}</label>
      {children}
      {help && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{help}</div>}
    </div>
  )
}

function CheckRow({ checked, onChange, label, sub }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: 12, marginTop: 10,
      border: `1px solid ${theme.border}`, borderRadius: 10,
      cursor: 'pointer', backgroundColor: checked ? theme.accentBg : '#fff',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
      <div>
        <div style={{ fontSize: 14, color: theme.text }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{sub}</div>}
      </div>
    </label>
  )
}

function BigButton({ onClick, children, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', marginTop: 16, padding: '14px 20px', minHeight: 50,
      backgroundColor: theme.accent, color: '#fff',
      border: 'none', borderRadius: 12,
      fontSize: 16, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}

function NavButtons({ onBack, onNext, nextLabel, nextDisabled }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
      <button onClick={onBack} style={{
        flex: 1, padding: '12px', minHeight: 48,
        background: 'transparent', border: `1px solid ${theme.border}`,
        color: theme.textSecondary, borderRadius: 10,
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>← Back</button>
      <button onClick={onNext} disabled={nextDisabled} style={{
        flex: 2, padding: '12px', minHeight: 48,
        background: theme.accent, color: '#fff',
        border: 'none', borderRadius: 10,
        fontSize: 14, fontWeight: 700,
        cursor: nextDisabled ? 'not-allowed' : 'pointer', opacity: nextDisabled ? 0.5 : 1,
      }}>{nextLabel}</button>
    </div>
  )
}

function ProgressDots({ count, active, onJump }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onJump?.(i)}
          style={{
            width: 28, height: 6, padding: 0,
            background: i <= active ? theme.accent : theme.border,
            border: 'none', borderRadius: 3, cursor: 'pointer',
          }}
        />
      ))}
    </div>
  )
}

function Centered({ children, tone }) {
  const color = tone === 'error' ? theme.error : theme.text
  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 480, color, textAlign: 'center', fontSize: 16 }}>{children}</div>
    </div>
  )
}
