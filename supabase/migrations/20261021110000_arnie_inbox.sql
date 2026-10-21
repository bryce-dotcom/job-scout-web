-- A person's email, forwarded to JobScout, for Arnie to work from (Christopher,
-- 2026-10-13: "check my emails 3 times a day … recap at 5pm"; "if I get an
-- email from a new lead … draft it in Lead Setter … put it on my calendar").
--
-- Arnie cannot open anyone's Gmail on a schedule — the computer rail needs the
-- person's own session — so the mail comes to him instead: each person gets a
-- private address, inbox+<token>@appsannex.com, and auto-forwards their
-- inboxes there. What arrives is FILED here, never answered; the routines read
-- it and draft cards a person approves.
--
-- The token is the whole secret: unguessable, one per person, revocable by
-- deleting the row. Written and read with the service key only (inbound-email,
-- arnie-chat); RLS on with no policies.
create table if not exists public.arnie_inbox_addresses (
  employee_id bigint primary key references public.employees(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.arnie_inbox_addresses enable row level security;

create table if not exists public.arnie_inbox (
  id bigserial primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  received_at timestamptz not null default now(),
  from_name text,
  from_email text,
  to_email text,            -- which of their inboxes it was sent to
  subject text,
  body text,                -- plain text, trimmed
  bulk boolean not null default false,   -- newsletter / automated / out-of-office
  email_id text,            -- the provider's id, so a webhook retry files it once
  handled_at timestamptz,   -- a routine has looked at it
  handled_note text,        -- what it did: "drafted a lead card", "not a lead"
  created_at timestamptz not null default now()
);
create unique index if not exists arnie_inbox_email_once on public.arnie_inbox (employee_id, email_id) where email_id is not null;
create index if not exists arnie_inbox_employee_received on public.arnie_inbox (employee_id, received_at desc);
alter table public.arnie_inbox enable row level security;
