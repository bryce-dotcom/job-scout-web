import { Link } from 'react-router-dom'

// Plain-English Privacy Policy template — placeholder until lawyer-
// drafted version is ready.

export const PRIVACY_VERSION = 'v1-2026-05-07'

const sectionHeader = { fontSize: 18, fontWeight: 700, color: '#2c3530', marginTop: 28, marginBottom: 8 }
const para = { fontSize: 14, color: '#4d5a52', lineHeight: 1.7, marginBottom: 12 }
const list = { fontSize: 14, color: '#4d5a52', lineHeight: 1.7, marginBottom: 12, paddingLeft: 20 }

export default function Privacy() {
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f7f5ef', padding: '32px 24px',
      maxWidth: 760, margin: '0 auto', fontFamily: 'system-ui, sans-serif',
    }}>
      <Link to="/login" style={{ color: '#5a6349', textDecoration: 'none', fontSize: 13 }}>← Back to sign-in</Link>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#2c3530', margin: '16px 0 4px' }}>Privacy Policy</h1>
      <p style={{ fontSize: 12, color: '#7d8a7f', marginBottom: 24 }}>Effective {new Date().toLocaleDateString()} — Version {PRIVACY_VERSION}</p>

      <p style={para}>
        This Privacy Policy describes how JobScout (&quot;we,&quot; &quot;us&quot;)
        collects, uses, and shares information about you and your tenant
        when you use the Service.
      </p>

      <h2 style={sectionHeader}>What we collect</h2>
      <ul style={list}>
        <li><strong>Account info</strong>: name, email, password (hashed), company name, role.</li>
        <li><strong>Tenant data you enter</strong>: customers, leads, jobs, invoices, photos, messages, etc. — all of this is your data, and you can export or delete it.</li>
        <li><strong>Usage data</strong>: which pages you visit, which features you use, error logs (Sentry). Used to improve the product.</li>
        <li><strong>Device data</strong>: browser, IP address, time of access. Used for security and analytics.</li>
        <li><strong>Location data (optional)</strong>: when employees opt in to live location while clocked in, we collect periodic GPS pings to display crew location on the WhosWorking dashboard. You can disable this per employee in Settings.</li>
      </ul>

      <h2 style={sectionHeader}>How we use it</h2>
      <ul style={list}>
        <li>To operate the Service (loading your data, running AI agents, sending emails to your customers via Resend).</li>
        <li>To send transactional emails about your account.</li>
        <li>To improve the product (anonymous usage analytics).</li>
        <li>To prevent abuse and respond to legal requests.</li>
      </ul>

      <h2 style={sectionHeader}>Who we share it with</h2>
      <p style={para}>
        We share data only with the third-party services that power
        JobScout, and only the minimum needed for them to do their job:
      </p>
      <ul style={list}>
        <li><strong>Supabase</strong> — database, authentication, storage, edge functions</li>
        <li><strong>Vercel</strong> — frontend hosting</li>
        <li><strong>Anthropic / Google / OpenAI</strong> — AI model APIs (only the prompt content needed for that specific call)</li>
        <li><strong>Resend</strong> — transactional email delivery</li>
        <li><strong>Stripe / PayPal</strong> — payment processing (when you collect customer payments via the portal)</li>
        <li><strong>Plaid</strong> — bank account connections (when you opt in to Books)</li>
        <li><strong>Sentry</strong> — error tracking</li>
      </ul>
      <p style={para}>
        We <strong>do not sell your data</strong> to advertisers or data brokers.
      </p>

      <h2 style={sectionHeader}>Tenant isolation</h2>
      <p style={para}>
        Each tenant&apos;s data is isolated at the database level via
        row-level security. Other JobScout tenants cannot read your data
        through the application. The only people who can access your data
        outside your tenant are JobScout staff debugging an issue you
        reported, and only with the minimum permissions needed.
      </p>

      <h2 style={sectionHeader}>Security</h2>
      <ul style={list}>
        <li>Passwords are hashed with bcrypt; we never see your plaintext password.</li>
        <li>All traffic is encrypted in transit (HTTPS/TLS).</li>
        <li>Database backups are encrypted at rest.</li>
        <li>Service-role keys and API secrets are stored server-side only, never in client code.</li>
      </ul>

      <h2 style={sectionHeader}>Your rights</h2>
      <ul style={list}>
        <li><strong>Export</strong>: download your tenant&apos;s data at any time from the Data Console.</li>
        <li><strong>Delete</strong>: close your account from Settings; we retain data for 30 days then permanently delete it.</li>
        <li><strong>Correct</strong>: edit any of your tenant data directly in the app.</li>
        <li><strong>Opt out of analytics</strong>: contact us to disable usage tracking on your tenant.</li>
      </ul>

      <h2 style={sectionHeader}>Changes</h2>
      <p style={para}>
        We may update this Privacy Policy. Material changes will be
        announced in-app at least 14 days before they take effect.
      </p>

      <h2 style={sectionHeader}>Contact</h2>
      <p style={para}>
        Privacy questions: <a href="mailto:bryce@hhh.services" style={{ color: '#5a6349' }}>bryce@hhh.services</a>.
      </p>

      <p style={{ ...para, fontSize: 12, color: '#7d8a7f', marginTop: 32 }}>
        This is a beta-period template and will be replaced with a
        lawyer-reviewed version before public launch.
      </p>
    </div>
  )
}
