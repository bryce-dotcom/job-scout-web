import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Eye, EyeOff } from 'lucide-react'

// Job Scout Theme - Light Topo
const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  shadowLg: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.08)'
}

// SVG Topo Map Pattern - subtle tan contour lines
const TopoBackground = () => (
  <svg
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: 0.06,
      pointerEvents: 'none'
    }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <pattern id="topoPatternLogin" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
        <path d="M0,40 Q30,20 60,35 Q100,55 140,30 Q180,10 200,40" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,70 Q50,50 100,70 T200,70" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,100 Q25,80 50,95 Q80,115 120,85 Q160,55 200,100" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,130 Q40,110 80,125 Q130,145 170,115 Q200,90 200,130" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,160 Q60,140 100,160 T200,160" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,190 Q35,170 70,185 Q110,200 150,175 Q200,150 200,190" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M40,0 Q25,50 40,100 Q55,150 40,200" fill="none" stroke="#c4b59a" strokeWidth="0.8" />
        <path d="M100,0 Q85,40 100,80 Q115,120 100,160 Q85,200 100,200" fill="none" stroke="#c4b59a" strokeWidth="0.8" />
        <path d="M160,0 Q175,50 160,100 Q145,150 160,200" fill="none" stroke="#c4b59a" strokeWidth="0.8" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#topoPatternLogin)" />
  </svg>
)

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
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)
  const checkDeveloperStatus = useStore((state) => state.checkDeveloperStatus)

  // Modes: signin, beta-signup, forgot-password
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const lookupEmployeeAndCompany = async (userEmail) => {
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*, company:companies(*)')
      .eq('email', userEmail)
      .eq('active', true)
      .single()

    if (empError || !employee) {
      await supabase.auth.signOut()
      return { success: false, error: 'No account found for this email. Contact your administrator.' }
    }

    if (!employee.company) {
      await supabase.auth.signOut()
      return { success: false, error: 'Company not found. Contact your administrator.' }
    }

    return { success: true, employee, company: employee.company }
  }

  const handleSignIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

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
    await checkDeveloperStatus()
    // Stamp last_login
    supabase.from('employees').update({ last_login: new Date().toISOString() }).eq('id', result.employee.id).then()
    navigate(result.company.setup_complete === false ? '/onboarding' : '/')
  }

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

    try {
      const res = await supabase.functions.invoke('beta-signup', {
        body: { email, password, companyName, inviteCode: inviteCode.trim().toUpperCase() }
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

      // Auto-sign in
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

    setMessage('Check your email for password reset instructions.')
    setLoading(false)
  }

  const handleGoogleOAuth = async () => {
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
        scopes: 'https://www.googleapis.com/auth/calendar.events.readonly'
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
    width: '100%',
    padding: '14px 16px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    color: theme.text,
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: theme.textSecondary
  }

  const onFocus = (e) => {
    e.target.style.borderColor = theme.accent
    e.target.style.boxShadow = `0 0 0 3px ${theme.accentBg}`
  }

  const onBlur = (e) => {
    e.target.style.borderColor = theme.border
    e.target.style.boxShadow = 'none'
  }

  const getTitle = () => {
    switch (mode) {
      case 'beta-signup': return 'Start Your Beta Trial'
      case 'forgot-password': return 'Reset Password'
      default: return 'Sign in to your account'
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative'
    }}>
      <TopoBackground />

      <div style={{
        width: '100%',
        maxWidth: '420px',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="/Scout_LOGO_GUY.png"
            alt="Job Scout"
            style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '16px' }}
          />
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.accent, marginBottom: '8px', letterSpacing: '-0.02em' }}>
            Job Scout
          </h1>
          <p style={{ fontSize: '15px', color: theme.textMuted }}>
            {getTitle()}
          </p>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '16px',
          padding: '32px',
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowLg
        }}>
          {error && (
            <div style={{
              marginBottom: '20px', padding: '14px 16px',
              backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: '10px', color: '#b91c1c', fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              marginBottom: '20px', padding: '14px 16px',
              backgroundColor: theme.accentBg, border: `1px solid ${theme.accent}30`,
              borderRadius: '10px', color: theme.accent, fontSize: '14px'
            }}>
              {message}
            </div>
          )}

          {/* ============ SIGN IN MODE ============ */}
          {mode === 'signin' && (
            <>
              <form onSubmit={handleSignIn}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      required minLength={6} placeholder="Enter password"
                      style={{ ...inputStyle, paddingRight: '48px' }} onFocus={onFocus} onBlur={onBlur}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '4px' }}>
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                {/* Forgot Password Link */}
                <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                  <button type="button" onClick={() => switchMode('forgot-password')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                    Forgot password?
                  </button>
                </div>

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.15s ease'
                }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = theme.accentHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.accent }}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0', gap: '16px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
                <span style={{ fontSize: '13px', color: theme.textMuted }}>or</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
              </div>

              {/* Google OAuth Button */}
              <button onClick={handleGoogleOAuth} style={{
                width: '100%', padding: '14px', backgroundColor: '#fff', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '10px', fontSize: '15px', fontWeight: '500',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'all 0.15s ease', boxSizing: 'border-box'
              }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8f8f8'; e.currentTarget.style.borderColor = theme.textMuted }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.borderColor = theme.border }}
              >
                <GoogleIcon />
                Sign in with Google
              </button>

              {/* Switch to Beta Signup */}
              <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: theme.textMuted }}>
                Don't have an account?{' '}
                <button type="button" onClick={() => switchMode('beta-signup')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
                  Start free beta trial
                </button>
              </div>
            </>
          )}

          {/* ============ BETA SIGNUP MODE ============ */}
          {mode === 'beta-signup' && (
            <>
              <form onSubmit={handleBetaSignup}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Invite Code</label>
                  <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required placeholder="Enter your invite code" style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.05em' }} onFocus={onFocus} onBlur={onBlur} />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Company Name</label>
                  <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Your company name" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      required minLength={6} placeholder="Create a password"
                      style={{ ...inputStyle, paddingRight: '48px' }} onFocus={onFocus} onBlur={onBlur}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '4px' }}>
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Confirm password" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </div>

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.15s ease'
                }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = theme.accentHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.accent }}
                >
                  {loading ? 'Creating your account...' : 'Create Account & Start Trial'}
                </button>
              </form>

              <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: theme.textMuted }}>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('signin')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
                  Sign in
                </button>
              </div>
            </>
          )}

          {/* ============ FORGOT PASSWORD MODE ============ */}
          {mode === 'forgot-password' && (
            <>
              <form onSubmit={handleForgotPassword}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </div>

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.15s ease'
                }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = theme.accentHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.accent }}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: theme.textMuted }}>
                <button type="button" onClick={() => switchMode('signin')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
                  Back to sign in
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: theme.textMuted }}>
          Powered by OG DiX Apps Annex
        </p>
      </div>
    </div>
  )
}
