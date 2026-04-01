import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Eye, EyeOff } from 'lucide-react'

const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
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

export default function AuthCallback() {
  const navigate = useNavigate()
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)
  const checkDeveloperStatus = useStore((state) => state.checkDeveloperStatus)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isRecovery, setIsRecovery] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState(null)

  const lookupEmployeeAndCompany = async (userEmail) => {
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*, company:companies(*)')
      .ilike('email', userEmail)
      .eq('active', true)
      .single()

    if (empError || !employee) {
      return { success: false, error: 'No account found for this email. Ask your admin to invite you, or start a beta trial.' }
    }

    if (!employee.company) {
      return { success: false, error: 'Company not found. Contact your administrator.' }
    }

    return { success: true, employee, company: employee.company }
  }

  // Store Google Calendar token if present in session
  const storeGoogleCalendarToken = async (session, employee) => {
    try {
      const providerToken = session.provider_token
      const providerRefreshToken = session.provider_refresh_token
      if (!providerToken || !employee?.id || !employee?.company_id) return

      await supabase.functions.invoke('google-calendar-token', {
        body: {
          action: 'store',
          employee_id: employee.id,
          company_id: employee.company_id,
          access_token: providerToken,
          refresh_token: providerRefreshToken || null,
          expires_in: 3600
        }
      })
    } catch (e) {
      console.warn('Failed to store Google Calendar token:', e)
    }
  }

  useEffect(() => {
    const handleCallback = async () => {
      // Check URL for recovery type
      const hash = window.location.hash
      const params = new URLSearchParams(window.location.search)
      const hashParams = new URLSearchParams(hash.replace('#', ''))
      const type = params.get('type') || hashParams.get('type')
      const gcalConnect = params.get('gcal_connect') === 'true'

      // If there's a code in the URL, always exchange it first — this is critical
      // for recovery (password reset) and Google Calendar connect flows.
      // The code must be exchanged to establish an auth session before we can
      // call updateUser() or access provider_token.
      const code = params.get('code')
      let session = null

      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError || !data.session) {
          setError('Authentication failed. Please try signing in again.')
          setLoading(false)
          return
        }
        session = data.session
      } else {
        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !existingSession) {
          setError('No session found. Please try signing in again.')
          setLoading(false)
          return
        }
        session = existingSession
      }

      // Now that session is established, check if this is a password recovery flow
      if (type === 'recovery') {
        setIsRecovery(true)
        setLoading(false)
        return
      }

      // Session acquired — look up employee
      const result = await lookupEmployeeAndCompany(session.user.email)

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      setUser(result.employee)
      setCompany(result.company)
      await checkDeveloperStatus()
      // Store Google Calendar token if present (provider_token is only available from code exchange)
      await storeGoogleCalendarToken(session, result.employee)
      supabase.from('employees').update({ last_login: new Date().toISOString() }).eq('id', result.employee.id).then()
      navigate(gcalConnect ? '/appointments' : (result.company.setup_complete === false ? '/onboarding' : '/'), { replace: true })
    }

    handleCallback()
  }, [navigate, setUser, setCompany, checkDeveloperStatus])

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setResetting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError(updateError.message)
      setResetting(false)
      return
    }

    setMessage('Password updated successfully! Redirecting...')
    setTimeout(() => navigate('/', { replace: true }), 1500)
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
    transition: 'all 0.15s ease'
  }

  // Recovery mode — show password reset form
  if (isRecovery) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: theme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '16px' }} />
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.accent, marginBottom: '8px' }}>Set New Password</h1>
            <p style={{ fontSize: '14px', color: theme.textMuted }}>Enter your new password below</p>
          </div>

          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            padding: '32px',
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadowLg
          }}>
            {error && (
              <div style={{ marginBottom: '20px', padding: '14px 16px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', color: '#b91c1c', fontSize: '14px' }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ marginBottom: '20px', padding: '14px 16px', backgroundColor: theme.accentBg, border: `1px solid ${theme.accent}30`, borderRadius: '10px', color: theme.accent, fontSize: '14px' }}>
                {message}
              </div>
            )}

            <form onSubmit={handlePasswordReset}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: theme.textSecondary }}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Enter new password"
                    style={{ ...inputStyle, paddingRight: '48px' }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '4px' }}>
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: theme.textSecondary }}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Confirm new password"
                  style={inputStyle}
                />
              </div>

              <button type="submit" disabled={resetting} style={{
                width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                cursor: resetting ? 'not-allowed' : 'pointer', opacity: resetting ? 0.7 : 1
              }}>
                {resetting ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Loading or error state
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '420px' }}>
        <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '16px' }} />
        {loading ? (
          <>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Signing you in...</h2>
            <p style={{ color: theme.textMuted, fontSize: '14px' }}>Please wait while we verify your account</p>
          </>
        ) : error ? (
          <>
            <div style={{ marginBottom: '20px', padding: '14px 16px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', color: '#b91c1c', fontSize: '14px' }}>
              {error}
            </div>
            <button
              onClick={() => navigate('/login', { replace: true })}
              style={{
                padding: '12px 24px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
              }}
            >
              Back to Sign In
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
