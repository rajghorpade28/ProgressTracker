-- ============================================================================
-- Shared Roadmap: multi-user authentication and one editor
-- ============================================================================
-- Run this once in the SQL Editor of YOUR Supabase project.
--
-- Before running it:
--   1. Replace YOUR_EDITOR_EMAIL@example.com below with the one account that
--      may change checkmarks, notes, deferred work, and recall reviews.
--   2. In Supabase Authentication > URL Configuration, add your deployed site
--      URL and a wildcard for its pages (for example https://example.com/**).
--   3. In Authentication > Providers, enable Email and configure Google with
--      its OAuth client ID/secret. The Google callback is shown by Supabase.
--
-- The browser has only the safe publishable/anon key. This SQL, not the UI,
-- verifies the signed-in user's JWT email before every database write.

create table if not exists public.tracker_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- A single-row private setting makes the "only one editor" rule explicit.
create table if not exists public.tracker_access_config (
  id boolean primary key default true check (id = true),
  editor_email text not null check (position('@' in editor_email) > 1),
  updated_at timestamptz not null default now()
);

insert into public.tracker_access_config (id, editor_email)
values (true, lower('YOUR_EDITOR_EMAIL@example.com'))
on conflict (id) do update
set editor_email = excluded.editor_email,
    updated_at = now();

alter table public.tracker_access_config enable row level security;
revoke all on table public.tracker_access_config from public, anon, authenticated;

alter table public.tracker_state enable row level security;
revoke all on table public.tracker_state from public, anon, authenticated;
grant select on table public.tracker_state to authenticated;

-- Remove the prior public/read and password-era policies so this migration is
-- safe to apply to the original single-user schema as well.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'tracker_state'
  loop
    execute format('drop policy if exists %I on public.tracker_state', policy_name);
  end loop;
end;
$$;

create policy "shared roadmap is readable"
  on public.tracker_state
  for select
  to authenticated
  using (true);

-- Retire the old password-based RPCs. Keeping a password in a browser session
-- would let anyone who obtained it act as the editor.
drop function if exists public.verify_admin_password(text);
drop function if exists public.rotate_admin_password(text, text);
drop function if exists public.sync_tracker_state(text, text, jsonb);

create or replace function public.tracker_access()
returns jsonb
language sql
security definer
set search_path = public, auth
stable
as $$
  select jsonb_build_object(
    'authenticated', auth.uid() is not null,
    'can_edit', exists (
      select 1
      from public.tracker_access_config config
      where config.id = true
        and lower(config.editor_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
$$;

create or replace function public.sync_tracker_state(p_doc_id text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_doc_id <> 'shared_roadmap' then
    raise exception 'Unknown roadmap document' using errcode = '22023';
  end if;

  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'Roadmap state must be a JSON object' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.tracker_access_config config
    where config.id = true
      and lower(config.editor_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception 'Only the configured editor can change this roadmap' using errcode = '42501';
  end if;

  insert into public.tracker_state (id, data, updated_at)
  values (p_doc_id, p_data, now())
  on conflict (id) do update
  set data = excluded.data,
      updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'updated_at', now());
end;
$$;

revoke all on function public.tracker_access() from public;
revoke all on function public.sync_tracker_state(text, jsonb) from public;
grant execute on function public.tracker_access() to authenticated;
grant execute on function public.sync_tracker_state(text, jsonb) to authenticated;

-- Existing viewers receive new state immediately; writes still pass through the
-- security-definer function above and cannot be made with direct table access.
do $$
begin
  alter publication supabase_realtime add table public.tracker_state;
exception
  when duplicate_object then null;
end;
$$;
alter table public.tracker_state replica identity full;

-- Change the sole editor later with this SQL (run it as the project owner):
-- update public.tracker_access_config
-- set editor_email = lower('new-editor@example.com'), updated_at = now()
-- where id = true;
