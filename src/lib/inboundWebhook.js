// Inbound webhook verification + HTML-to-text — re-export shim.
//
// Implementation lives in supabase/functions/_shared/inboundWebhook.ts so the
// receiver and these tests check ONE signature routine. A verifier that
// diverged from the receiver would pass here and refuse every real webhook.
//
// Do not reimplement anything here.

export {
  verifySvixSignature,
  htmlToText,
  SVIX_TOLERANCE_SEC,
} from '../../supabase/functions/_shared/inboundWebhook.ts'
