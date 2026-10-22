-- A person asking, on the business's public page, to get its texts.
--
-- HHH's A2P 10DLC campaign was rejected twice (2026-10-21: error 30909, the
-- call to action could not be verified). "Our office records consent" is not
-- something a carrier reviewer can see. /legal/:slug/text-signup is: a
-- server-rendered page (api/legal.js, readable with no JavaScript) with an
-- unticked box and the exact disclosure. Each opt-in is kept here with the
-- words agreed to, when, and from where — the evidence a carrier asks for.
--
-- Written by api/legal.js with the service key; RLS on, no policies.
create table if not exists public.sms_opt_ins (
  id bigserial primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  phone text not null,          -- digits only, 10 (US)
  name text,
  disclosure text not null,     -- the sentence on the page when they ticked it
  source text not null default 'web_form',
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists sms_opt_ins_company_phone on public.sms_opt_ins (company_id, phone);
create index if not exists sms_opt_ins_ip_recent on public.sms_opt_ins (ip, created_at desc);
alter table public.sms_opt_ins enable row level security;
