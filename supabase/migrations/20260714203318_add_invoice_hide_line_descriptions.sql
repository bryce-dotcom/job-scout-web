-- Per-invoice display flag: when true, the PDF + customer portal show only
-- the line-item NAME (e.g. "100W Wall Pack w/ Lift") and omit the longer
-- description detail (e.g. "Parts & Labor / Adjustable, Cut Off..."). Lets
-- the team choose a clean invoice vs. a detailed one. Default false keeps
-- the current behavior (descriptions shown).
alter table public.invoices
  add column if not exists hide_line_descriptions boolean not null default false;
