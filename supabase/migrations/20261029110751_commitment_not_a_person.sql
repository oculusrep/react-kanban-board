-- Addresses the triage panel must stop offering "Add contact" for.
--
-- NOT scoped per mailbox, unlike the rest of the commitment layer. Whether
-- info@acme.com is a person is a fact about the address, not a judgement about
-- whose inbox saw it, so a second mailbox must not have to be told again.
--
-- There is no undo in the UI, which matches how rejections work in this panel:
-- a dismissal sticks. Removing one is a delete by hand, which is why
-- authenticated gets no DELETE below.
create table if not exists public.commitment_not_a_person (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  -- Where the dismissal was made from. Provenance only: the row stays useful
  -- after the commitment it came from is retired, hence ON DELETE SET NULL.
  commitment_id uuid references public.commitment(id) on delete set null,
  created_by_id uuid default auth.uid(),
  created_at    timestamptz not null default now()
);

-- One row per address, case-insensitively: the same address arrives capitalised
-- differently from different senders.
create unique index if not exists commitment_not_a_person_email_key
  on public.commitment_not_a_person (lower(email));

alter table public.commitment_not_a_person enable row level security;

drop policy if exists commitment_not_a_person_select_internal on public.commitment_not_a_person;
-- (select ...) so the gate is an InitPlan, evaluated once, not per row.
create policy commitment_not_a_person_select_internal
  on public.commitment_not_a_person
  for select to authenticated
  using ((select public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses. The panel reads;
-- commitment-action writes with the secret key, as it does for every other
-- mutation in this feature.
revoke all on public.commitment_not_a_person from anon, authenticated;
grant select on public.commitment_not_a_person to authenticated;
grant select, insert on public.commitment_not_a_person to service_role;

-- Which of these addresses should the panel offer "Add contact" for?
--
-- Done in SQL because the test is case-insensitive across two columns, and
-- `contact` has 4611 addresses of which 63 are stored mixed-case: a PostgREST
-- .in() on lowercased addresses would silently miss those 63 and offer to
-- create a contact that already exists. Also keeps one round trip instead of a
-- long in.(...) URL.
--
-- SECURITY INVOKER on purpose: the caller's own RLS on `contact` decides what
-- counts as an existing contact for them.
create or replace function public.commitment_unknown_counterparties(p_emails text[])
returns table (email text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct x.e
  from unnest(p_emails) as x(e)
  where x.e is not null
    and btrim(x.e) <> ''
    and not exists (
      select 1 from public.contact c
      where lower(c.email) = lower(x.e)
         or lower(c.personal_email) = lower(x.e)
    )
    and not exists (
      select 1 from public.commitment_not_a_person n
      where lower(n.email) = lower(x.e)
    )
    -- Colleagues are users, not contacts. The same two tests the email lookup
    -- uses to refuse prefilling our own details (@oculusrep.com, plus any OVIS
    -- user whatever their domain), so the panel never opens a form that the
    -- lookup would then decline to fill.
    and x.e not ilike '%@oculusrep.com'
    and not exists (
      select 1 from public."user" u where lower(u.email) = lower(x.e)
    );
$$;

revoke all on function public.commitment_unknown_counterparties(text[]) from public, anon;
grant execute on function public.commitment_unknown_counterparties(text[]) to authenticated;
