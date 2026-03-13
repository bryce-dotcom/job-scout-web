import { useState, useEffect, useCallback } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { supabase } from '../lib/supabase'
import { Landmark } from 'lucide-react'

export default function PlaidLink({ companyId, onSuccess, onError, theme, style }) {
  const [linkToken, setLinkToken] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    const createToken = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase.functions.invoke('plaid-link', {
          body: { action: 'create_link_token', company_id: companyId }
        })
        if (!cancelled) {
          if (error || data?.error) {
            onError?.(data?.error || 'Failed to create link token')
          } else {
            setLinkToken(data.link_token)
          }
        }
      } catch (e) {
        if (!cancelled) onError?.(e.message)
      }
      if (!cancelled) setLoading(false)
    }

    createToken()
    return () => { cancelled = true }
  }, [companyId])

  const onPlaidSuccess = useCallback(async (publicToken, metadata) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('plaid-link', {
        body: {
          action: 'exchange_public_token',
          company_id: companyId,
          public_token: publicToken,
          institution: metadata?.institution || null,
        }
      })
      if (error || data?.error) {
        onError?.(data?.error || 'Failed to connect account')
      } else {
        onSuccess?.(data)
      }
    } catch (e) {
      onError?.(e.message)
    }
    setLoading(false)
  }, [companyId, onSuccess, onError])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: (err) => {
      if (err) onError?.(err.display_message || err.error_message || 'Plaid Link closed with error')
    },
  })

  const defaultTheme = {
    accent: '#5a6349',
    bg: '#f7f5ef',
    border: '#d6cdb8',
    text: '#2c3530',
  }
  const t = theme || defaultTheme

  return (
    <button
      onClick={() => open()}
      disabled={!ready || loading || !linkToken}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        backgroundColor: '#2ca01c',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '13px',
        fontWeight: '500',
        cursor: (!ready || loading || !linkToken) ? 'not-allowed' : 'pointer',
        opacity: (!ready || loading || !linkToken) ? 0.6 : 1,
        ...style,
      }}
    >
      <Landmark size={14} />
      {loading ? 'Connecting...' : 'Connect Bank Account'}
    </button>
  )
}
