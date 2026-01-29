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

export default function Login() {
  const navigate = useNavigate()
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)
  const checkDeveloperStatus = useStore((state) => state.checkDeveloperStatus)

  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }

      const { error: signUpError } = await supabase.auth.signUp({ email, password })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      setMessage('Check your email for the confirmation link. Your administrator must add you as an employee before you can sign in.')
      setLoading(false)
    } else {
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
      navigate('/')
    }
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp)
    setError(null)
    setMessage(null)
    setConfirmPassword('')
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
        <div style={{
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          <img
            src="/Scout_LOGO_GUY.png"
            alt="Job Scout"
            style={{
              width: '100px',
              height: '100px',
              objectFit: 'contain',
              marginBottom: '16px'
            }}
          />
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: theme.accent,
            marginBottom: '8px',
            letterSpacing: '-0.02em'
          }}>
            Job Scout
          </h1>
          <p style={{
            fontSize: '15px',
            color: theme.textMuted
          }}>
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
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
              marginBottom: '20px',
              padding: '14px 16px',
              backgroundColor: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: '10px',
              color: '#b91c1c',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              marginBottom: '20px',
              padding: '14px 16px',
              backgroundColor: theme.accentBg,
              border: `1px solid ${theme.accent}30`,
              borderRadius: '10px',
              color: theme.accent,
              fontSize: '14px'
            }}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: theme.textSecondary
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                style={inputStyle}
                onFocus={(e) => {
                  e.target.style.borderColor = theme.accent
                  e.target.style.boxShadow = `0 0 0 3px ${theme.accentBg}`
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = theme.border
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: theme.textSecondary
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Enter password"
                  style={{ ...inputStyle, paddingRight: '48px' }}
                  onFocus={(e) => {
                    e.target.style.borderColor = theme.accent
                    e.target.style.boxShadow = `0 0 0 3px ${theme.accentBg}`
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = theme.border
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: theme.textMuted,
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: theme.textSecondary
                }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Confirm password"
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = theme.accent
                    e.target.style.boxShadow = `0 0 0 3px ${theme.accentBg}`
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = theme.border
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: theme.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = theme.accentHover
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.accent
              }}
            >
              {loading
                ? (isSignUp ? 'Creating account...' : 'Signing in...')
                : (isSignUp ? 'Create Account' : 'Sign In')
              }
            </button>
          </form>

          <div style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '14px',
            color: theme.textMuted
          }}>
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.accent,
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.accent,
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          marginTop: '24px',
          fontSize: '13px',
          color: theme.textMuted
        }}>
          Powered by OG DiX Apps Annex
        </p>
      </div>
    </div>
  )
}
