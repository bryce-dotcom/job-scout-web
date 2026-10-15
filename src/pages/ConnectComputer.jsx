// "Connect this computer?" — the one screen a person sees when pairing.
//
// The agent opens this itself, with the code in the URL. The person is
// already signed in here, and that session is what authorises the pairing —
// nothing is typed and nothing is copied. Press Connect, done.
//
// It names the computer that is asking, because "allow code a3f9…" asks
// somebody to trust a string they have never seen. "Connect BRYCE-LAPTOP?"
// is a question they can actually answer.

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { rememberAfterLogin } from '../lib/afterLogin'
import { Monitor, Check, AlertTriangle, Loader2 } from 'lucide-react'

const t = {
  bg: '#f7f5ef', card: '#ffffff', ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f',
  line: '#d6cdb8', accent: '#5a6349', add: '#2f7d4e', rm: '#b91c1c',
  amber: '#b45309', amberBg: 'rgba(180,83,9,0.10)',
}

const PLATFORM = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

export default function ConnectComputer() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const company = useStore((s) => s.company)
  const clearSession = useStore((s) => s.clearSession)
  const code = params.get('code') || ''
  // The shared public demo (Login's "Explore the live demo").
  const isDemo = String(user?.email || '').toLowerCase() === 'demo@jobscout.app'

  // Sign out and come straight back to THIS code once signed in as the right
  // person (lib/afterLogin), so the agent waiting on that computer still pairs.
  const switchAccount = async () => {
    rememberAfterLogin(`/connect?code=${encodeURIComponent(code)}`)
    try { await clearSession() } catch { /* signed out either way below */ }
    try { await supabase.auth.signOut() } catch { /* already out */ }
    navigate('/login')
  }

  const [asking, setAsking] = useState(null)   // what the agent said it is
  const [state, setState] = useState('loading') // loading|ready|none|done|error
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const look = useCallback(async () => {
    if (!code) { setState('none'); return }
    try {
      const { data, error } = await supabase.functions.invoke('arnie-pair', { body: { action: 'describe', code } })
      if (error) throw error
      if (!data?.found) { setState('none'); return }
      if (data.claimed) { setState('done'); return }
      setAsking(data)
      setState('ready')
    } catch (e) {
      setErr(String(e.message || e)); setState('error')
    }
  }, [code])

  useEffect(() => { look() }, [look])

  const connect = async () => {
    setBusy(true); setErr('')
    try {
      // The agent gets THIS session's refresh token, which is what lets it
      // keep working tomorrow without asking again. It never sees a password.
      const { data: s } = await supabase.auth.getSession()
      const refresh = s?.session?.refresh_token
      if (!refresh) throw new Error('Your session has expired — sign in again and reconnect.')

      // Claimed on the AUTHENTICATED rail, not the public pairing function:
      // that one cannot prove who you are.
      const { data, error } = await supabase.functions.invoke('arnie-computer', {
        body: { action: 'pair_claim', code, refresh_token: refresh },
      })
      if (error) {
        let detail = ''
        try { detail = (await error.context?.json())?.error || '' } catch { /* not json */ }
        throw new Error(detail || error.message)
      }
      if (!data?.ok) throw new Error(data?.error || 'That did not take.')
      setState('done')
    } catch (e) {
      setErr(String(e.message || e))
    } finally { setBusy(false) }
  }

  const Shell = ({ children }) => (
    <div style={{
      minHeight: '100vh', background: t.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: t.card, border: `1px solid ${t.line}`, borderRadius: 16,
        padding: 26, maxWidth: 420, width: '100%', textAlign: 'center',
      }}>{children}</div>
    </div>
  )

  if (state === 'loading') {
    return <Shell><Loader2 size={22} style={{ color: t.muted }} /><p style={{ color: t.sub, marginTop: 10 }}>One moment…</p></Shell>
  }

  if (state === 'none') {
    return (
      <Shell>
        <AlertTriangle size={26} style={{ color: t.amber }} />
        <h1 style={{ fontSize: 19, color: t.ink, margin: '12px 0 6px' }}>Nothing is waiting</h1>
        <p style={{ fontSize: 14, color: t.sub, lineHeight: 1.55, margin: 0 }}>
          This link has expired, or the agent is no longer running. Start it again on the computer
          you want to connect and it will open a fresh one.
        </p>
      </Shell>
    )
  }

  if (state === 'done') {
    return (
      <Shell>
        <div style={{
          width: 46, height: 46, borderRadius: '50%', background: 'rgba(47,125,78,0.12)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Check size={24} style={{ color: t.add }} /></div>
        <h1 style={{ fontSize: 19, color: t.ink, margin: '12px 0 6px' }}>Connected</h1>
        <p style={{ fontSize: 14, color: t.sub, lineHeight: 1.55, margin: '0 0 16px' }}>
          You can close this. Arnie cannot touch anything on that computer until you allow a
          program — you choose which, one at a time.
        </p>
        <button onClick={() => navigate('/agents/arnie/computer')} style={btn(t.accent, '#fff')}>
          Choose what he may use
        </button>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{
        width: 46, height: 46, borderRadius: '50%', background: 'rgba(90,99,73,0.12)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}><Monitor size={23} style={{ color: t.accent }} /></div>

      <h1 style={{ fontSize: 19, color: t.ink, margin: '12px 0 4px' }}>Connect this computer?</h1>
      <p style={{ fontSize: 14.5, color: t.ink, fontWeight: 600, margin: '0 0 2px' }}>
        {asking?.device_label || 'A computer'}
      </p>
      <p style={{ fontSize: 12.5, color: t.muted, margin: '0 0 14px' }}>
        {PLATFORM[asking?.platform] || asking?.platform || ''}
        {asking?.agent_version ? ` · agent ${asking.agent_version}` : ''}
      </p>

      {/* WHOSE ACCOUNT, said plainly — and the way out when it is the wrong one.
          This used to be " · as demo@jobscout.app" in grey at the end of a
          line. London's Mac browser was signed in to the demo, he pressed
          Connect, and his computer went to Mike Sullivan's account — so his
          own Computer page stayed empty and it looked as if nothing worked. */}
      <div style={{
        border: `1px solid ${isDemo ? t.amber : t.line}`, background: isDemo ? t.amberBg : '#faf8f2',
        borderRadius: 11, padding: '11px 13px', margin: '0 0 14px', textAlign: 'left',
      }}>
        <div style={{ fontSize: 11.5, color: t.muted, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Connecting to</div>
        <div style={{ fontSize: 15, color: t.ink, fontWeight: 650, marginTop: 2 }}>{user?.name || user?.email || 'this account'}</div>
        <div style={{ fontSize: 12.5, color: t.sub }}>{[user?.email, company?.company_name].filter(Boolean).join(' · ')}</div>
        {isDemo && (
          <div style={{ fontSize: 13, color: t.amber, marginTop: 8, lineHeight: 1.5 }}>
            This is the <strong>demo account</strong>, not yours. Sign in as yourself and this
            computer connects to you.
          </div>
        )}
        <button
          type="button"
          onClick={switchAccount}
          disabled={busy}
          style={{ background: 'none', border: 0, padding: 0, marginTop: 8, color: t.accent, fontWeight: 600, fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}
        >
          {isDemo ? 'Sign in as myself' : 'Not you? Sign in as someone else'}
        </button>
      </div>

      <p style={{ fontSize: 13.5, color: t.sub, lineHeight: 1.6, margin: '0 0 16px', textAlign: 'left' }}>
        This lets Arnie work on that computer <strong>as you</strong> — but only in programs you
        allow afterwards, one at a time. He never types a password, never clicks anything that
        cannot be undone, and you can stop him from that computer at any moment.
      </p>

      {err && (
        <div style={{ background: 'rgba(185,28,28,0.08)', color: t.rm, borderRadius: 9, padding: '9px 11px', fontSize: 13, marginBottom: 12, textAlign: 'left' }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {/* Never one tap to pair a real computer to the demo. */}
        <button onClick={connect} disabled={busy || isDemo} style={{ ...btn(t.accent, '#fff'), flex: 1, opacity: isDemo ? 0.45 : 1 }}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <button onClick={() => navigate('/')} disabled={busy} style={{ ...btn('#f0ebdd', t.sub), flex: 1 }}>
          Not now
        </button>
      </div>

      <p style={{ fontSize: 11.5, color: t.muted, margin: '14px 0 0' }}>
        If you did not just start the agent on that computer, press Not now.
      </p>
    </Shell>
  )
}

const btn = (bg, fg) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  background: bg, color: fg, border: '1px solid transparent', cursor: 'pointer',
  borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 600, minHeight: 46,
})
