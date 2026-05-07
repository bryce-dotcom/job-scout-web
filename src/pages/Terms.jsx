import { Link } from 'react-router-dom'

// Plain-English Terms of Service template — placeholder until a real
// lawyer-drafted version is ready. Versioned so we can track which
// tenants accepted which revision.

export const TOS_VERSION = 'v1-2026-05-07'

const sectionHeader = { fontSize: 18, fontWeight: 700, color: '#2c3530', marginTop: 28, marginBottom: 8 }
const para = { fontSize: 14, color: '#4d5a52', lineHeight: 1.7, marginBottom: 12 }
const list = { fontSize: 14, color: '#4d5a52', lineHeight: 1.7, marginBottom: 12, paddingLeft: 20 }

export default function Terms() {
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f7f5ef', padding: '32px 24px',
      maxWidth: 760, margin: '0 auto', fontFamily: 'system-ui, sans-serif',
    }}>
      <Link to="/login" style={{ color: '#5a6349', textDecoration: 'none', fontSize: 13 }}>← Back to sign-in</Link>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#2c3530', margin: '16px 0 4px' }}>Terms of Service</h1>
      <p style={{ fontSize: 12, color: '#7d8a7f', marginBottom: 24 }}>Effective {new Date().toLocaleDateString()} — Version {TOS_VERSION}</p>

      <p style={para}>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of
        JobScout (&quot;Service&quot;), provided by AppsAnnex. By creating an
        account or using the Service, you agree to be bound by these Terms.
      </p>

      <h2 style={sectionHeader}>1. Service description</h2>
      <p style={para}>
        JobScout is a multi-tenant business management platform for field
        service companies. The Service includes lead management, job
        scheduling, invoicing, employee time tracking, and AI-assisted
        workflows. Specific features available depend on your subscription
        tier and which AI agents you have enabled.
      </p>

      <h2 style={sectionHeader}>2. Your account</h2>
      <ul style={list}>
        <li>You are responsible for keeping your password secret.</li>
        <li>You must be at least 18 years old and authorized to bind the company you sign up on behalf of.</li>
        <li>One person may operate multiple companies under separate accounts; sharing a single account between unrelated companies is not allowed.</li>
        <li>We may suspend or terminate accounts that violate these Terms or applicable law.</li>
      </ul>

      <h2 style={sectionHeader}>3. Your data</h2>
      <p style={para}>
        You own the data you put into JobScout (customers, jobs, invoices,
        photos, etc.). We store and process it on your behalf to operate
        the Service. We do not sell your data to third parties.
      </p>
      <p style={para}>
        Your data is isolated from other tenants&apos; data via row-level
        security. Database backups are encrypted at rest. You can export
        your data at any time from the admin Data Console.
      </p>

      <h2 style={sectionHeader}>4. Our data — agents and machine learning</h2>
      <p style={para}>
        AI agents in the Service (Lenard, Freddy, Conrad, Victor, Arnie,
        Frankie, Zach) may use anonymized, aggregated patterns derived
        from your usage to improve the agents&apos; accuracy. Identifiable
        customer information is not used for cross-tenant model training.
      </p>

      <h2 style={sectionHeader}>5. Acceptable use</h2>
      <ul style={list}>
        <li>Don&apos;t use the Service to send spam, harass, or break the law.</li>
        <li>Don&apos;t reverse-engineer or scrape the Service.</li>
        <li>Don&apos;t use the Service to store regulated data (HIPAA / PCI / classified) — JobScout is not certified for those workloads.</li>
        <li>Don&apos;t bypass per-plan rate limits (e.g., AI calls, edge function invocations).</li>
      </ul>

      <h2 style={sectionHeader}>6. Subscription, fees, and trial</h2>
      <p style={para}>
        Beta tenants may use the Service free of charge during the beta
        period. After the beta concludes, paid subscription tiers will
        apply. We&apos;ll give you 30 days&apos; written notice before any
        billing begins on your account, with the option to export your
        data and close your account before charges start.
      </p>

      <h2 style={sectionHeader}>7. Termination</h2>
      <p style={para}>
        You may close your account at any time from Settings. We may
        terminate or suspend an account for breach of these Terms,
        non-payment, or as required by law. Upon termination, we will
        retain your data for 30 days for export purposes, then delete it.
      </p>

      <h2 style={sectionHeader}>8. Disclaimers and limitation of liability</h2>
      <p style={para}>
        The Service is provided &quot;as is.&quot; We don&apos;t promise it will be
        uninterrupted, error-free, or fit for any particular purpose. To
        the maximum extent permitted by law, our total liability to you
        for any claim arising from the Service is limited to the fees you
        paid in the 12 months preceding the claim.
      </p>

      <h2 style={sectionHeader}>9. Changes to these Terms</h2>
      <p style={para}>
        We may update these Terms from time to time. Material changes
        will be announced in-app at least 14 days before they take
        effect. Continued use after the effective date constitutes
        acceptance.
      </p>

      <h2 style={sectionHeader}>10. Contact</h2>
      <p style={para}>
        Questions? Email <a href="mailto:bryce@hhh.services" style={{ color: '#5a6349' }}>bryce@hhh.services</a>.
      </p>

      <p style={{ ...para, fontSize: 12, color: '#7d8a7f', marginTop: 32 }}>
        These Terms are a beta-period template and will be replaced with
        a lawyer-reviewed version before public launch. Tenants will be
        prompted to re-accept at that time.
      </p>
    </div>
  )
}
