import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { MapPin, Eye, EyeOff } from 'lucide-react'

// Job Scout Theme
const theme = {
  bg: '#0c1210',
  bgCard: '#151f1a',
  bgCardHover: '#1e2d25',
  border: '#2a3f32',
  text: '#f0fdf4',
  textSecondary: '#9cb3a3',
  textMuted: '#6b8073',
  accent: '#22c55e',
  accentHover: '#16a34a',
  accentBg: 'rgba(34,197,94,0.15)',
  shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
  shadowLg: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
}

// SVG Topo Map Pattern
const TopoBackground = () => (
  <svg
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: 0.08,
      pointerEvents: 'none'
    }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <pattern id="topoPatternLogin" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
        <path d="M0,50 Q50,20 100,50 T200,50" fill="none" stroke="#22c55e" strokeWidth="0.5" />
        <path d="M0,80 Q40,50 80,70 Q120,90 160,60 Q200,30 200,80" fill="none" stroke="#22c55e" strokeWidth="0.5" />
        <path d="M0,120 Q30,100 60,110 Q100,130 140,100 Q180,70 200,120" fill="none" stroke="#22c55e" strokeWidth="0.5" />
        <path d="M0,160 Q50,140 100,160 T200,160" fill="none" stroke="#22c55e" strokeWidth="0.5" />
        <path d="M50,0 Q30,50 50,100 Q70,150 50,200" fill="none" stroke="#22c55e" strokeWidth="0.5" />
        <path d="M150,0 Q170,60 150,100 Q130,140 150,200" fill="none" stroke="#22c55e" strokeWidth="0.5" />
        <circle cx="100" cy="100" r="30" fill="none" stroke="#22c55e" strokeWidth="0.3" />
        <circle cx="100" cy="100" r="50" fill="none" stroke="#22c55e" strokeWidth="0.3" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#topoPatternLogin)" />
  </svg>
)

export default function Login() {
  const navigate = useNavigate()
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)

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
    transition: 'all 0.2s ease'
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
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            backgroundColor: theme.accentBg,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            border: `1px solid ${theme.accent}30`,
            boxShadow: `0 0 40px ${theme.accent}20`
          }}>
            <MapPin size={36} style={{ color: theme.accent }} />
          </div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: theme.text,
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
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px',
              color: '#fca5a5',
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
                  e.target.style.boxShadow = `0 0 0 3px ${theme.accent}20`
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
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: '48px' }}
                  onFocus={(e) => {
                    e.target.style.borderColor = theme.accent
                    e.target.style.boxShadow = `0 0 0 3px ${theme.accent}20`
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
                  placeholder="••••••••"
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = theme.accent
                    e.target.style.boxShadow = `0 0 0 3px ${theme.accent}20`
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
                background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentHover} 100%)`,
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.2s ease',
                boxShadow: `0 4px 14px ${theme.accent}40`
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = `0 6px 20px ${theme.accent}50`
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = `0 4px 14px ${theme.accent}40`
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
