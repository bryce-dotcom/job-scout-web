import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Read the actual policies on time_clock. Guessing at RLS is what has cost
  // the last two hours.
  const { data, error } = await sb.rpc("pg_policies_probe").catch(() => ({ data: null, error: "no rpc" }));
  if (data) return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ error: String(error) }), { headers: { "Content-Type": "application/json" } });
});
