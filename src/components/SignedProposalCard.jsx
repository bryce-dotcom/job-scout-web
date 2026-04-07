import { useEffect, useState } from 'react'
import { FileText, Download, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

/**
 * SignedProposalCard
 *
 * Reusable summary card for a signed formal proposal. Takes an attachment id
 * and resolves the file + approval metadata so it can be dropped onto both
 * EstimateDetail and JobDetail without copy-pasting the query logic.
 *
 * Props:
 * - attachmentId: number (required)
 * - quoteId: number (optional — used to look up the matching document_approvals row)
 * - theme: object with at least bgCard, border, text, textMuted, accent, success
 */
export default function SignedProposalCard({ attachmentId, quoteId, theme }) {
  const [attachment, setAttachment] = useState(null)
  const [approval, setApproval] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signedUrl, setSignedUrl] = useState(null)
  const [signedUrlLoading, setSignedUrlLoading] = useState(false)

  const t = theme || {
    bgCard: '#ffffff',
    border: '#d6cdb8',
    text: '#2c3530',
    textMuted: '#7d8a7f',
    accent: '#5a6349',
    success: '#4a7c59',
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!attachmentId) { setLoading(false); return }
      setLoading(true)
      try {
        const [{ data: att }, approvalQuery] = await Promise.all([
          supabase.from('file_attachments').select('*').eq('id', attachmentId).maybeSingle(),
          quoteId
            ? supabase
                .from('document_approvals')
                .select('*')
                .eq('document_type', 'estimate')
                .eq('document_id', quoteId)
                .order('approved_at', { ascending: false })
                .limit(1)
            : Promise.resolve({ data: null }),
        ])
        if (cancelled) return
        setAttachment(att || null)
        setApproval(approvalQuery?.data?.[0] || null)
      } catch (err) {
        console.warn('[SignedProposalCard] load error', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [attachmentId, quoteId])

  const openSigned = async () => {
    if (!attachment) return
    setSignedUrlLoading(true)
    try {
      const { data, error } = await supabase.storage
        .from(attachment.storage_bucket || 'project-documents')
        .createSignedUrl(attachment.file_path, 300)
      if (error) throw error
      if (data?.signedUrl) {
        setSignedUrl(data.signedUrl)
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('[SignedProposalCard] signed url error', err)
    } finally {
      setSignedUrlLoading(false)
    }
  }

  if (loading || !attachment) return null

  const methodLabel = approval?.signature_method === 'drawn'
    ? 'Drawn signature'
    : approval?.signature_method === 'typed'
      ? 'Typed signature'
      : 'Signed'

  return (
    <div style={{
      backgroundColor: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: 'rgba(74,124,89,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <CheckCircle2 size={22} color={t.success} />
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.text, fontSize: 14, fontWeight: 700 }}>
          <FileText size={16} color={t.accent} />
          Signed Proposal on File
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
          {approval?.approver_name ? `${approval.approver_name} — ` : ''}
          {approval?.approved_at ? new Date(approval.approved_at).toLocaleString() : new Date(attachment.created_at).toLocaleString()}
          {` · ${methodLabel}`}
        </div>
        {approval?.legal_terms_hash && (
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2, fontFamily: 'monospace' }}>
            Terms hash: {approval.legal_terms_hash.slice(0, 16)}…
          </div>
        )}
      </div>
      <button
        onClick={openSigned}
        disabled={signedUrlLoading}
        style={{
          padding: '10px 16px',
          borderRadius: 10,
          border: `1px solid ${t.accent}`,
          backgroundColor: 'transparent',
          color: t.accent,
          fontWeight: 600,
          fontSize: 13,
          cursor: signedUrlLoading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Download size={14} />
        {signedUrlLoading ? 'Opening…' : 'View PDF'}
      </button>
    </div>
  )
}
