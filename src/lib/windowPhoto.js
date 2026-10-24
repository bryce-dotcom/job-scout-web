// Reading a photo into a window takeoff — re-export shim.
//
// The prompt, the validation and the run-to-row translation live in
// supabase/functions/_shared/windowPhoto.ts so walter-analyze and the app
// share ONE copy. The app needs photoRunToRow to turn an accepted proposal
// into a glass_areas row, and the tests need normalizeAnalysis, which is the
// gate everything the model says has to pass. Do not reimplement anything
// here; add to the shared module instead.

export {
  FACES,
  SEGMENTS,
  CONDITIONS,
  CONFIDENCE,
  buildWindowPhotoPrompt,
  normalizeAnalysis,
  runReady,
  photoRunToRow,
} from '../../supabase/functions/_shared/windowPhoto.ts'
