import { useState, useEffect, useCallback } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { supabase } from '../lib/supabase'
import { Landmark } from 'lucide-react'

// updateItemId: reopen an existing bank link in Plaid's update mode to add
// the Auth product (routing + account numbers) — no public-token exchange
// afterwards, the item already has its access token. Used by Payroll's ACH
// settings when a bank was linked for Books before Auth was asked for.
// relink: update mode for a bank whose login broke (ITEM_LOGIN_REQUIRED) —
// re-authenticate only, do not ask Plaid to add Auth on the way through.
export default function PlaidLink({ companyId, onSuccess, onError, theme, style, updateItemId = null, relink = false, label = null }) {
  const [linkToken, setLinkToken] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    const createToken = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase.functions.invoke('plaid-link', {
          body: { action: 'create_link_token', company_id: companyId, ...(updateItemId ? { update_item_id: updateItemId } : {}), ...(relink ? { relink: true } : {}) }
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
  }, [companyId, updateItemId, relink])

  const onPlaidSuccess = useCallback(async (publicToken, metadata) => {
    // Update mode: the item is already linked; Plaid has just added Auth to
    // it. Nothing to exchange — tell the caller to re-read.
    if (updateItemId) { onSuccess?.({ updated_item_id: updateItemId, institution: metadata?.institution || null }); return }
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
  }, [companyId, onSuccess, onError, updateItemId])

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
      {loading ? 'Connecting...' : (label || (updateItemId ? (relink ? 'Re-login to bank' : 'Reconnect bank for payroll') : 'Connect Bank Account'))}
    </button>
  )
}
