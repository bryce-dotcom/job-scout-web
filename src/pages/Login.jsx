import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { PLANS } from '../lib/billingPlans'
import { Eye, EyeOff, Check, ArrowRight } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { CardCaptureModal } from '../components/BillingTab'

// Storefront palette (matches /pricing) so the signup flows straight out of the
// marketing page without a plain-form cliff. Green = structure, hi-vis orange =
// the money CTA.
const theme = {
  bg: '#f4efe3',
  bgCard: '#fffdf7',
  bgCardHover: '#f0ebdd',
  border: '#d9cfb6',
  text: '#191d15',
  textSecondary: '#4f5a4a',
  textMuted: '#848a79',
  accent: '#54613a',
  accentHover: '#3a4526',
  accentBg: 'rgba(84,97,58,0.10)',
  hivis: '#f26a12',
  hivisHover: '#c9530a',
  night: '#161b12',
  shadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  shadowLg: '0 14px 40px -18px rgba(25,29,21,0.35)',
}

// Google "G" Icon SVG
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

export default function Login() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)
  const checkDeveloperStatus = useStore((state) => state.checkDeveloperStatus)

  // Modes: signin, beta-signup, forgot-password.
  // Deep-link: /login?signup=1&plan=field_pro (from /pricing) opens signup with
  // the chosen plan shown.
  const params = (() => { try { return new URLSearchParams(window.location.search) } catch { return new URLSearchParams() } })()
  const [mode, setMode] = useState(params.get('signup') ? 'beta-signup' : 'signin')
  const [cardStep, setCardStep] = useState(null) // { companyId } — card capture shown after the account is created
  const selectedPlan = PLANS.find((p) => p.id === params.get('plan')) || null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [tosAccepted, setTosAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const lookupEmployeeAndCompany = async (userEmail) => {
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('*, company:companies(*)')
      .ilike('email', userEmail)
      .eq('active', true)

    if (empError || !employees || employees.length === 0) {
      await supabase.auth.signOut()
      return { success: false, error: 'No account found for this email. Contact your administrator.' }
    }

    const withCompany = employees.filter(e => e.company)
    if (withCompany.length === 0) {
      await supabase.auth.signOut()
      return { success: false, error: 'Company not found. Contact your administrator.' }
    }

    const employee = withCompany.sort((a, b) => a.company_id - b.company_id)[0]
    return { success: true, employee, company: employee.company }
  }

  const handleSignIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      const result = await lookupEmployeeAndCompany(data.user.email)

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      setUser(result.employee)
      setCompany(result.company)
      checkDeveloperStatus().catch(() => {})
      supabase.from('employees').update({ last_login: new Date().toISOString() }).eq('id', result.employee.id).then()
      navigate(result.company.setup_complete === false ? '/onboarding' : '/')
    } catch (err) {
      console.error('[Login] Sign in error:', err)
      setError('Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  // One-click demo — sign into the shared, read-to-explore demo company. Reached
  // from the storefront's "Try the live demo" button (/login?demo=1) or the link
  // on this page. DEMO is a throwaway public account by design.
  const DEMO = { email: 'demo@jobscout.app', password: 'Demo1234!' }
  const handleDemoLogin = async () => {
    setLoading(true); setError(null); setMessage(null)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword(DEMO)
      if (authError) throw authError
      const result = await lookupEmployeeAndCompany(data.user.email)
      if (!result.success) throw new Error(result.error)
      setUser(result.employee)
      setCompany(result.company)
      checkDeveloperStatus().catch(() => {})
      navigate('/')
    } catch (err) {
      console.error('[Login] Demo login error:', err)
      setError('The live demo is temporarily unavailable — please try again in a moment.')
      setLoading(false)
    }
  }

  // Auto-launch the demo when arriving from /login?demo=1 (storefront button).
  useEffect(() => {
    if (params.get('demo') === '1') handleDemoLogin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBetaSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    if (!tosAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue')
      setLoading(false)
      return
    }

    try {
      const res = await supabase.functions.invoke('beta-signup', {
        body: {
          email, password, companyName,
          inviteCode: inviteCode.trim().toUpperCase(),
          plan: selectedPlan?.id || null,
          tosAccepted: true,
          tosVersion: 'v1-2026-05-07',
        }
      })

      if (res.error) {
        setError(res.error.message || 'Signup failed')
        setLoading(false)
        return
      }

      const data = res.data
      if (!data.success) {
        setError(data.error || 'Signup failed')
        setLoading(false)
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        setError('Account created but sign-in failed. Please sign in manually.')
        setMode('signin')
        setLoading(false)
        return
      }

      const result = await lookupEmployeeAndCompany(email)

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      setUser(result.employee)
      setCompany(result.company)
      await checkDeveloperStatus()
      supabase.from('employees').update({ last_login: new Date().toISOString() }).eq('id', result.employee.id).then()
      // The account already exists (trialing). If a plan was chosen, capture a card
      // now to activate the trial — the first charge lands at day 30. Reuses the
      // proven CardCaptureModal (SetupIntent -> create-subscription on master Stripe).
      if (selectedPlan?.id && data.companyId) {
        setLoading(false)
        setCardStep({ companyId: data.companyId })
        return
      }
      navigate('/onboarding')
    } catch (err) {
      setError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/callback?type=recovery'
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setMessage('Password reset link sent! Check your email (and spam folder) for instructions.')
    setLoading(false)
  }

  const handleGoogleOAuth = async () => {
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
        scopes: 'https://www.googleapis.com/auth/calendar.events.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    })

    if (oauthError) {
      setError(oauthError.message)
    }
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setError(null)
    setMessage(null)
    setPassword('')
    setConfirmPassword('')
    if (newMode !== 'forgot-password') setEmail('')
  }

  const inputStyle = {
    width: '100%', padding: '14px 16px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '11px', color: theme.text,
    fontSize: '15px', outline: 'none', transition: 'all 0.15s ease', boxSizing: 'border-box',
    fontFamily: 'inherit',
  }
  const labelStyle = { display: 'block', marginBottom: '8px', fontSize: '13.5px', fontWeight: 600, color: theme.textSecondary }
  const onFocus = (e) => { e.target.style.borderColor = theme.hivis; e.target.style.boxShadow = `0 0 0 3px ${theme.vizBg || 'rgba(242,106,18,0.12)'}` }
  const onBlur = (e) => { e.target.style.borderColor = theme.border; e.target.style.boxShadow = 'none' }

  // Primary (hi-vis) button — the money CTA.
  const primaryBtn = (disabled) => ({
    width: '100%', padding: '15px', backgroundColor: disabled ? theme.textMuted : theme.hivis,
    color: '#fff', border: 'none', borderRadius: '11px', fontSize: '15.5px', fontWeight: 700,
    cursor: (loading || disabled) ? 'not-allowed' : 'pointer', opacity: loading ? 0.75 : 1,
    transition: 'all 0.15s ease', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  })

  const getTitle = () => {
    switch (mode) {
      case 'beta-signup': return selectedPlan ? `Start your ${selectedPlan.name} trial` : 'Start your free trial'
      case 'forgot-password': return 'Reset your password'
      default: return 'Welcome back'
    }
  }
  const getSub = () => {
    switch (mode) {
      case 'beta-signup': return '30 days free · cancel anytime · card required to start'
      case 'forgot-password': return 'We’ll email you a reset link'
      default: return 'Sign in to your JobScout account'
    }
  }

  const money = (n) => '$' + (Number(n) || 0).toLocaleString()

  // ── Brand panel (desktop) — dark, on-brand, shows what they’re signing up for.
  const brandPanel = (
    <div style={{
      flex: '1 1 46%', maxWidth: 560, background: theme.night, color: '#f4efe3',
      padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      position: 'relative', overflow: 'hidden',
      backgroundImage: 'radial-gradient(120% 80% at 100% 0%, rgba(242,106,18,0.16), transparent 55%), radial-gradient(rgba(255,255,255,0.05) 0.6px, transparent 0.6px)',
      backgroundSize: 'auto, 20px 20px',
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 850, fontSize: 20, letterSpacing: '-0.02em' }}>
          <img src="/Scout_LOGO_GUY.png" alt="JobScout" style={{ height: 40, width: 'auto', display: 'block' }} />
          JobScout
        </div>
        <h2 style={{ fontSize: 34, fontWeight: 850, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '48px 0 0', maxWidth: '14ch', textWrap: 'balance' }}>
          Burn the status quo.
        </h2>
        <p style={{ color: '#cfcbba', fontSize: 15.5, margin: '16px 0 0', maxWidth: '34ch', lineHeight: 1.5 }}>
          The business operating system — your whole back office in one login, plus a crew of AI robots doing the busywork while you do the work.
        </p>
        <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Live in an afternoon', 'Import your customers in one click', 'Runs offline in the field'].map((tp) => (
            <div key={tp} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, color: '#e2ddce' }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(143,191,106,0.16)', color: '#8fbf6a', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Check size={13} /></span>
              {tp}
            </div>
          ))}
        </div>
      </div>

      {selectedPlan && mode === 'beta-signup' && (
        <div style={{ position: 'relative', marginTop: 36, padding: '18px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ffb27a' }}>You’re starting</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{selectedPlan.name}</div>
            <div style={{ fontSize: 15, color: '#cfcbba' }}><b style={{ color: '#fff', fontSize: 20 }}>{money(selectedPlan.monthly_price)}</b>/mo</div>
          </div>
          <div style={{ fontSize: 12.5, color: '#a9ad9c', marginTop: 4 }}>Free for 30 days, then {money(selectedPlan.monthly_price)}/mo. Change or cancel anytime.</div>
        </div>
      )}
    </div>
  )

  const errBox = error && (
    <div style={{ marginBottom: 18, padding: '13px 15px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 11, color: '#b91c1c', fontSize: 14 }}>{error}</div>
  )
  const msgBox = message && (
    <div style={{ marginBottom: 18, padding: '13px 15px', backgroundColor: theme.accentBg, border: `1px solid ${theme.accent}30`, borderRadius: 11, color: theme.accent, fontSize: 14 }}>{message}</div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg, display: 'flex', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: theme.text }}>
      {cardStep && (
        <CardCaptureModal
          companyId={cardStep.companyId}
          planId={selectedPlan?.id}
          interval="monthly"
          theme={theme}
          onClose={() => navigate('/onboarding')}
          onSuccess={() => navigate('/onboarding')}
        />
      )}
      {!isMobile && brandPanel}

      {/* Form side */}
      <div style={{ flex: '1 1 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '28px 18px' : '40px' }}>
        <div style={{ width: '100%', maxWidth: 430 }}>
          {/* Mobile brand header */}
          {isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 850, fontSize: 19, marginBottom: 22 }}>
              <img src="/Scout_LOGO_GUY.png" alt="JobScout" style={{ height: 34, width: 'auto' }} /> JobScout
            </div>
          )}

          {/* Mobile plan chip */}
          {isMobile && selectedPlan && mode === 'beta-signup' && (
            <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 12, background: theme.night, color: '#f4efe3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><span style={{ fontSize: 11, color: '#ffb27a' }}>Starting</span><div style={{ fontWeight: 800, fontSize: 16 }}>{selectedPlan.name}</div></div>
              <div style={{ fontSize: 13, color: '#cfcbba' }}><b style={{ color: '#fff', fontSize: 17 }}>{money(selectedPlan.monthly_price)}</b>/mo · 30-day trial</div>
            </div>
          )}

          <h1 style={{ fontSize: isMobile ? 25 : 30, fontWeight: 850, letterSpacing: '-0.03em', margin: 0, textWrap: 'balance' }}>{getTitle()}</h1>
          <p style={{ fontSize: 14.5, color: theme.textMuted, margin: '8px 0 24px' }}>{getSub()}</p>

          <div style={{ backgroundColor: theme.bgCard, borderRadius: 18, padding: isMobile ? '20px' : '28px', border: `1px solid ${theme.border}`, boxShadow: theme.shadowLg }}>
            {errBox}
            {msgBox}

            {/* ============ SIGN IN ============ */}
            {mode === 'signin' && (
              <>
                <form onSubmit={handleSignIn}>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Enter password" style={{ ...inputStyle, paddingRight: 48 }} onFocus={onFocus} onBlur={onBlur} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: 4 }}>
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginBottom: 20 }}>
                    <button type="button" onClick={() => switchMode('forgot-password')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Forgot password?</button>
                  </div>
                  <button type="submit" disabled={loading} style={primaryBtn(false)}>{loading ? 'Signing in…' : 'Sign in'} {!loading && <ArrowRight size={17} />}</button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', margin: '22px 0', gap: 16 }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                  <span style={{ fontSize: 13, color: theme.textMuted }}>or</span>
                  <div style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                </div>

                <button onClick={handleGoogleOAuth} style={{ width: '100%', padding: 14, backgroundColor: '#fff', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 11, fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxSizing: 'border-box' }}>
                  <GoogleIcon /> Sign in with Google
                </button>

                <button type="button" onClick={handleDemoLogin} disabled={loading} style={{ width: '100%', marginTop: 12, padding: 14, backgroundColor: theme.accentBg, color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box', opacity: loading ? 0.6 : 1 }}>
                  Explore the live demo <ArrowRight size={16} />
                </button>

                <div style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: theme.textMuted }}>
                  New to JobScout?{' '}
                  <button type="button" onClick={() => switchMode('beta-signup')} style={{ background: 'none', border: 'none', color: theme.hivis, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Start a free trial</button>
                </div>
              </>
            )}

            {/* ============ SIGN UP ============ */}
            {mode === 'beta-signup' && (
              <>
                <form onSubmit={handleBetaSignup}>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Company name</label>
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Your company name" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Work email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <label style={labelStyle}>Password</label>
                      <div style={{ position: 'relative' }}>
                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Create password" style={{ ...inputStyle, paddingRight: 44 }} onFocus={onFocus} onBlur={onBlur} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: 4 }}>
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <label style={labelStyle}>Confirm</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Confirm password" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Invite code <span style={{ color: theme.textMuted, fontWeight: 400 }}>(optional)</span></label>
                    <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Have one? Enter it" style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.05em' }} onFocus={onFocus} onBlur={onBlur} />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, padding: 12, borderRadius: 11, backgroundColor: theme.bg, border: `1px solid ${theme.border}`, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={tosAccepted} onChange={(e) => setTosAccepted(e.target.checked)} style={{ marginTop: 3, accentColor: theme.hivis, cursor: 'pointer', width: 16, height: 16, flexShrink: 0 }} required />
                    <span style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
                      I agree to the <a href="/terms" target="_blank" rel="noreferrer" style={{ color: theme.accent, fontWeight: 600 }}>Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: theme.accent, fontWeight: 600 }}>Privacy Policy</a>.
                    </span>
                  </label>

                  <button type="submit" disabled={loading || !tosAccepted} style={primaryBtn(!tosAccepted)}>
                    {loading ? 'Creating your account…' : 'Create account & start trial'} {!loading && <ArrowRight size={17} />}
                  </button>
                </form>

                <div style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: theme.textMuted }}>
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchMode('signin')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Sign in</button>
                </div>
              </>
            )}

            {/* ============ FORGOT PASSWORD ============ */}
            {mode === 'forgot-password' && (
              <>
                <div style={{ marginBottom: 16, fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
                  Enter the email you use to sign in. First time? Use this to set a password.
                </div>
                <form onSubmit={handleForgotPassword}>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </div>
                  <button type="submit" disabled={loading} style={primaryBtn(false)}>{loading ? 'Sending…' : 'Send reset link'}</button>
                </form>
                <div style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: theme.textMuted }}>
                  <button type="button" onClick={() => switchMode('signin')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Back to sign in</button>
                </div>
              </>
            )}
          </div>

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 12.5, color: theme.textMuted }}>Powered by OG DiX · Apps Annex</p>
        </div>
      </div>
    </div>
  )
}
