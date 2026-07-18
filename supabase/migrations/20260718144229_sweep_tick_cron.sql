-- Automated Deep-Sweep — the engine cron.
--
-- A dedicated shared secret (vault) authenticates the cron -> ovis-sweep-tick
-- call. The tick fetches the expected value from the DB via get_sweep_tick_secret
-- (service role) — no edge env var needed. This mirrors the working
-- gcal_cron_secret pattern; the `service_role_key` vault secret referenced by
-- some older crons does NOT exist on this project (silent-failure trap), so we
-- do NOT use it.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sweep_tick_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'sweep_tick_secret',
      'Shared secret authenticating the ovis-sweep-tick cron -> edge call'
    );
  end if;
end $$;

create or replace function public.get_sweep_tick_secret()
returns text language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sweep_tick_secret' limit 1;
$$;
revoke all on function public.get_sweep_tick_secret() from public, anon, authenticated;
grant execute on function public.get_sweep_tick_secret() to service_role;

-- Every minute: drive all running sweeps one step. Idle no-op when none running.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ovis-sweep-tick') then
    perform cron.unschedule('ovis-sweep-tick');
  end if;
end $$;

select cron.schedule('ovis-sweep-tick', '* * * * *', $cron$
  select net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-sweep-tick',
    headers := jsonb_build_object(
      'X-Sweep-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sweep_tick_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$cron$);
