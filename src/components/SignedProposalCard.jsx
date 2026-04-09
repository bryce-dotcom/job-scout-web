import { useEffect, useState } from 'react'
import { FileText, Download, CheckCircle2, ShieldCheck, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { supabase } from '../lib/supabase'

/**
 * SignedProposalCard
 *
 * Reusable summary card for a signed formal proposal. Takes an attachment id
 * and resolves the file + approval metadata so it can be dropped onto both
 * EstimateDetail and JobDetail without copy-pasting the query logic.
 *
 * The card now also carries a gold "ELECTRONICALLY SIGNED" badge and an
 * expandable Verification section with the full audit trail — IP, user
 * agent, approval id, and both hashes — so reps can confirm a signature's
 * legitimacy without opening the PDF.
 *
 * Props:
 * - attachmentId: number (required)
 * - quoteId: number (optional — used to look up the matching document_approvals row)
 * - theme: object with at least bgCard, border, text, textMuted, accent, success
 */
export default function SignedProposalCard({ attachmentId, quoteId, theme }) {
  const [attachment, setAttachment] = useState(null)
  const [approval, setApproval] = useState(null)
  const [signatureUrl, setSignatureUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signedUrlLoading, setSignedUrlLoading] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [showFullUA, setShowFullUA] = useState(false)
  const [copied, setCopied] = useState(null)

  const t = theme || {
    bgCard: '#ffffff',
    border: '#d6cdb8',
    text: '#2c3530',
    textMuted: '#7d8a7f',
    accent: '#5a6349',
    success: '#4a7c59',
  }

  // Gold palette (matches certGold* in proposalTheme.js and the PDF stamp)
  const gold = '#d4af37'
  const goldBg = 'rgba(212,175,55,0.12)'
  const goldBorder = 'rgba(212,175,55,0.5)'

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
                .select('id, approver_name, approver_email, approved_at, signature_method, signature_typed_text, signature_image_path, legal_terms_hash, document_hash, ip_address, user_agent')
                .eq('document_type', 'estimate')
                .eq('document_id', quoteId)
                .order('approved_at', { ascending: false })
                .limit(1)
            : Promise.resolve({ data: null }),
        ])
        if (cancelled) return
        setAttachment(att || null)
        const approvalRow = approvalQuery?.data?.[0] || null
        setApproval(approvalRow)
        // Resolve drawn signature image URL for display
        if (approvalRow?.signature_image_path && approvalRow.signature_method === 'drawn') {
          try {
            const { data: sigUrl } = await supabase.storage
              .from('project-documents')
              .createSignedUrl(approvalRow.signature_image_path, 3600)
            if (!cancelled && sigUrl?.signedUrl) setSignatureUrl(sigUrl.signedUrl)
          } catch (_) { /* best-effort */ }
        }
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
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('[SignedProposalCard] signed url error', err)
    } finally {
      setSignedUrlLoading(false)
    }
  }

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value || ''))
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* ignore */ }
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
      position: 'relative',
    }}>
      {/* Gold "ELECTRONICALLY SIGNED" corner badge */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: goldBg,
        border: `1px solid ${goldBorder}`,
        color: gold,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        <ShieldCheck size={12} />
        Electronically Signed
      </div>

      <div style={{
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

      {/* Visual signature — makes the card look official.
          Drawn signatures show the PNG image; typed signatures
          render in a cursive script font with a gold underline. */}
      {approval && (signatureUrl || (approval.signature_method === 'typed' && approval.signature_typed_text)) && (
        <div style={{
          marginTop: 14,
          padding: '14px 20px',
          background: 'linear-gradient(135deg, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.02) 100%)',
          border: `1px solid ${goldBorder}`,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
              Customer Signature
            </div>
            {signatureUrl ? (
              <img
                src={signatureUrl}
                alt="Customer signature"
                style={{
                  maxHeight: 56,
                  maxWidth: 280,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
                }}
              />
            ) : (
              <div style={{
                fontFamily: "'Brush Script MT', 'Segoe Script', 'Apple Chancery', cursive",
                fontSize: 28,
                color: '#1a2520',
                borderBottom: `2px solid ${gold}`,
                display: 'inline-block',
                paddingBottom: 2,
                lineHeight: 1.2,
              }}>
                {approval.signature_typed_text}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: t.textMuted }}>
              {approval.approved_at ? new Date(approval.approved_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </div>
            <div style={{
              marginTop: 4,
              fontSize: 9,
              fontWeight: 700,
              color: gold,
              letterSpacing: 0.5,
            }}>
              VERIFIED
            </div>
          </div>
        </div>
      )}

      {/* Verification toggle */}
      {approval && (
        <button
          type="button"
          onClick={() => setShowVerification((s) => !s)}
          style={{
            marginTop: 12,
            background: 'none',
            border: 'none',
            color: t.accent,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {showVerification ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showVerification ? 'Hide verification details' : 'Show verification details'}
        </button>
      )}

      {showVerification && approval && (
        <div style={{
          marginTop: 10,
          padding: '12px 14px',
          borderRadius: 10,
          background: goldBg,
          border: `1px solid ${goldBorder}`,
          fontSize: 11,
          color: t.text,
          lineHeight: 1.6,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: gold,
            marginBottom: 8,
          }}>
            <ShieldCheck size={12} />
            E-Sign Act Certificate of Authenticity
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '6px 16px' }}>
            <VRow label="Signer" value={approval.approver_name || '-'} muted={t.textMuted} />
            <VRow label="Email" value={approval.approver_email || '-'} muted={t.textMuted} />
            <VRow label="Signed At" value={approval.approved_at ? new Date(approval.approved_at).toLocaleString() : '-'} muted={t.textMuted} />
            <VRow label="Method" value={methodLabel} muted={t.textMuted} />
            <VRow label="IP Address" value={approval.ip_address || '-'} muted={t.textMuted} />
            <VRow label="Approval ID" value={approval.id || '-'} muted={t.textMuted} />
          </div>

          {approval.user_agent && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>User Agent</div>
              <div style={{ fontSize: 10, color: t.text, fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all' }}>
                {showFullUA ? approval.user_agent : approval.user_agent.slice(0, 80) + (approval.user_agent.length > 80 ? '…' : '')}
              </div>
              {approval.user_agent.length > 80 && (
                <button
                  type="button"
                  onClick={() => setShowFullUA((s) => !s)}
                  style={{ background: 'none', border: 'none', color: t.accent, fontSize: 10, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 2 }}
                >
                  {showFullUA ? 'show less' : 'show full'}
                </button>
              )}
            </div>
          )}

          {approval.document_hash && (
            <HashRow label="Document Hash" value={approval.document_hash} muted={t.textMuted} onCopy={() => copy(approval.document_hash, 'doc')} copied={copied === 'doc'} accent={t.accent} text={t.text} />
          )}
          {approval.legal_terms_hash && (
            <HashRow label="Terms Hash" value={approval.legal_terms_hash} muted={t.textMuted} onCopy={() => copy(approval.legal_terms_hash, 'terms')} copied={copied === 'terms'} accent={t.accent} text={t.text} />
          )}

          <div style={{ marginTop: 10, fontSize: 9, color: t.textMuted, lineHeight: 1.5 }}>
            Captured per the U.S. Electronic Signatures in Global and National Commerce Act
            (15 U.S.C. § 7001 et seq.) and Utah Code § 46-4.
          </div>
        </div>
      )}
    </div>
  )
}

function VRow({ label, value, muted }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#2c3530', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(value)}</div>
    </div>
  )
}

function HashRow({ label, value, muted, onCopy, copied, accent, text }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <button type="button" onClick={onCopy} style={{ background: 'none', border: 'none', color: accent, fontSize: 10, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Copy size={10} />
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <div style={{ fontSize: 10, color: text, fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  )
}
