// Where the signature goes on a document — re-export shim.
//
// The implementation lives in supabase/functions/_shared/signatureTargets.ts
// so the app and the edge functions share ONE copy. The customer signs in the
// portal and the stamping happens in approve-document, while the job page
// stamps in the browser; both have to agree on where a signature belongs, and
// a rule written twice is how the Material/Labor split spent months being
// "fixed" one surface at a time (see lib/materialLaborSplit).
//
// Add to the core, never here.

export {
  findSignatureTargets,
  signatureRects,
  describeSignability,
} from '../../supabase/functions/_shared/signatureTargets.ts'
