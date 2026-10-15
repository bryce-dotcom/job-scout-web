-- Venmo payments, which the bank feed never sees.
--
-- Tracy (2026-10-09): "It would be greatly appreciated if we can figure out how
-- to link the venmo payment to an invoice. This would make it easier for me to
-- see when someone pays by venmo since I don't see those transactions."
--
-- WHY SHE CANNOT SEE THEM. HHH's bank feed carries 45 rows saying "Venmo",
-- $25,203.70, and every one is money going OUT — the company funding its Venmo
-- balance. Not one is a customer paying in. The only linked institution is
-- Mountain America (checking, savings, a card); no Venmo account is connected
-- at all. So a customer's payment lands in the Venmo balance, which JobScout
-- cannot see, and stays invisible until somebody transfers it to the bank —
-- and that transfer is one lump that says nothing about who paid or what for.
--
-- 'Venmo' already exists as a payment method and three have been recorded by
-- hand. The missing half was never recording it; it was KNOWING.
--
-- Venmo emails the moment somebody pays. The office forwards that email to
-- venmo+<signed token>@appsannex.com and it lands here.
--
-- A NOTICE IS NOT A PAYMENT. Nothing in this table touches the books. It says
-- "Venmo says Jane Smith sent you $120" and waits for a person to say which
-- invoice that is — at which point the ordinary payment row is written by the
-- ordinary code. An email can be a forward, a duplicate, a personal payment to
-- the owner, or a refund of something; turning it into revenue unattended
-- would put money in the books that nobody can trace.

create table if not exists venmo_notices (
  id           bigserial primary key,
  company_id   integer not null,
  payer_name   text not null,
  amount       numeric(12,2) not null check (amount > 0),
  note         text,
  source       text not null default 'venmo_email',
  raw_subject  text,
  email_id     text,
  received_at  timestamptz not null default now(),

  -- what a person decided
  status            text not null default 'new'
                    check (status in ('new', 'linked', 'ignored')),
  linked_invoice_id integer,
  linked_payment_id integer,
  decided_by        integer,
  decided_at        timestamptz,
  decided_note      text,

  created_at timestamptz not null default now()
);

comment on table venmo_notices is
  'Venmo "someone paid you" emails. A notice, never a payment — see src/lib/venmoNotice. Nothing here reaches the books until a person links it to an invoice.';

-- Resend retries a webhook it thinks failed, and the office may forward the
-- same mail twice. Either way one email is one notice.
create unique index if not exists venmo_notices_email_uniq
  on venmo_notices (company_id, email_id)
  where email_id is not null;

-- The screen reads "what is still waiting", newest first.
create index if not exists venmo_notices_pending_idx
  on venmo_notices (company_id, status, received_at desc);

alter table venmo_notices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='venmo_notices' and policyname='tenant_isolation') then
    create policy tenant_isolation on venmo_notices
      for all to authenticated
      using (company_id in (select current_user_company_ids()))
      with check (company_id in (select current_user_company_ids()));
  end if;
end $$;
