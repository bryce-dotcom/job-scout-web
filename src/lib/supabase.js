import { createClient } from '@supabase/supabase-js';

// Safari PWA can silently lose localStorage. This wrapper falls back gracefully
// instead of throwing, which prevents "Authentication Failed" on iOS home-screen apps.
const safePersistence = {
  getItem: (key) => {
    try { return globalThis.localStorage.getItem(key) }
    catch { return null }
  },
  setItem: (key, value) => {
    try { globalThis.localStorage.setItem(key, value) }
    catch { /* quota or access error — session stays in memory */ }
  },
  removeItem: (key) => {
    try { globalThis.localStorage.removeItem(key) }
    catch { /* ignore */ }
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
