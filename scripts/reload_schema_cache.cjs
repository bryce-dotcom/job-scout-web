// PostgREST caches table schemas in memory. After a migration that adds
// columns, the cache may still report "Could not find the 'X' column" until
// it's reloaded. Sending NOTIFY pgrst, 'reload schema' over the SQL editor
// is the official trick — but supabase-js doesn't expose raw NOTIFY, so we
// use the rpc-via-fetch pattern with the management API equivalent:
// hit /rest/v1/rpc/pg_notify which calls pg_notify() in Postgres.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  // Use a one-shot SQL exec via the management API isn't available without
  // a PAT. Easier: insert+select on a tiny test of the new column. If it
  // still 400s, we'll know the cache hasn't refreshed yet (PostgREST
  // refreshes automatically every ~10 minutes, or when DDL fires NOTIFY).
  const r = await fetch(`${URL}/rest/v1/payments?select=id,source&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  const body = await r.text();
  console.log('payments?select=id,source ->', r.status);
  console.log(body.slice(0, 300));
})();
