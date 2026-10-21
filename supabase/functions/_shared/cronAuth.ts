// Who may run a scheduled job, and who may run it for one company.
//
// Until 2026-10-21 the five pg_cron jobs (collections, Frankie's brief, the
// health check, crash alerts, payroll reminders) sent the public anon key
// and the functions checked nothing: any JWT the gateway accepted — the anon
// key is one — could run collections for every tenant, text their customers,
// and mail their managers. marketing-suggest closed this on 10-15 with a key
// pg_cron reads from Vault; this is the same rule for the rest.
//
//   cron       → x-internal-key equals CRON_INTERNAL_KEY (Vault secret
//                cron_internal_key on the database side), or the caller is a
//                verified service role. The anon bearer still rides along so
//                the gateway (verify_jwt=true) lets the request through; it
//                proves nothing on its own.
//   a person   → a verified employee of that company at the required level.
//
// Nothing here changes what a job does. It only decides whether it runs.

import { isServiceCaller, resolveCaller, type Caller } from './auth.ts'

export interface CronEnv { url: string; key: string }

/** The scheduler itself, or one of our own servers. */
export async function isCronCaller(req: Request, env: CronEnv): Promise<boolean> {
  const presented = (req.headers.get('x-internal-key') || '').trim()
  const keys = [Deno.env.get('CRON_INTERNAL_KEY'), Deno.env.get('MARKETING_INTERNAL_KEY')].map((k) => (k || '').trim()).filter(Boolean)
  if (presented && keys.includes(presented)) return true
  return await isServiceCaller(req, env.url, env.key)
}

export type CompanyCaller =
  | { ok: true; caller: Caller | null; via: 'cron' | 'employee' }
  | { ok: false; status: 401 | 403; error: string }

/**
 * May this request act for `companyId`? The scheduler and our servers may act
 * for anyone; a person must be a verified employee of that company at
 * `minLevel` (2 = Manager) or above. A platform admin (level 5) may act for
 * any company, which is what the support pages rely on.
 */
export async function callerForCompany(req: Request, env: CronEnv, companyId: number | null | undefined, minLevel = 2): Promise<CompanyCaller> {
  if (await isCronCaller(req, env)) return { ok: true, caller: null, via: 'cron' }
  const caller = await resolveCaller(req, env.url, env.key, { verify: true })
  if (!caller?.companyId) return { ok: false, status: 401, error: 'Sign in first.' }
  if (caller.level < minLevel) return { ok: false, status: 403, error: 'Only a Manager or above can run this.' }
  if (companyId && Number(companyId) !== Number(caller.companyId) && caller.level < 5) return { ok: false, status: 403, error: 'That is not your company.' }
  return { ok: true, caller, via: 'employee' }
}
