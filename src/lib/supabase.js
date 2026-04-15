import { createClient } from '@supabase/supabase-js';

// Safari PWA can silently lose localStorage. This wrapper falls back to
// sessionStorage when localStorage fails, which is critical for PKCE flows
// (the code_verifier MUST survive the OAuth redirect round-trip).
const safePersistence = {
  getItem: (key) => {
    try {
      const val = globalThis.localStorage.getItem(key)
      if (val !== null) return val
    } catch (e) {
      console.warn('localStorage read failed:', key, e.message)
    }
    // Fallback: sessionStorage survives same-tab redirects (OAuth callback)
    try { return globalThis.sessionStorage.getItem(key) }
    catch { return null }
  },
  setItem: (key, value) => {
    // Write to BOTH so the verifier is available regardless of which storage survives
    try { globalThis.localStorage.setItem(key, value) }
    catch (e) { console.warn('localStorage write failed:', key, e.message) }
    try { globalThis.sessionStorage.setItem(key, value) }
    catch { /* session stays in memory */ }
  },
  removeItem: (key) => {
    try { globalThis.localStorage.removeItem(key) } catch {}
    try { globalThis.sessionStorage.removeItem(key) } catch {}
  }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storage: safePersistence
    }
  }
);
