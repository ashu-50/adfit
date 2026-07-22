-- ---------------------------------------------------------------------------
-- Hand-written SQL that Prisma cannot express.
-- Run AFTER `prisma migrate deploy`:  psql "$DIRECT_URL" -f prisma/rls.sql
--
-- Defence in depth. Prisma connects with a role that BYPASSES RLS, so the
-- authoritative ownership check lives in src/lib/db/repositories/*.
-- These policies protect anything that reaches Postgres through the Supabase
-- anon/authenticated keys (Realtime subscriptions, Storage, PostgREST).
-- ---------------------------------------------------------------------------

create extension if not exists "pg_trgm";
create extension if not exists "pgcrypto";

-- Trigram index powers dashboard search without a separate search service.
create index if not exists analyses_title_trgm_idx on public.analyses using gin (title gin_trgm_ops);
create index if not exists analyses_url_trgm_idx   on public.analyses using gin (target_url gin_trgm_ops);

-- Partial index: the dashboard almost always filters to finished work.
create index if not exists analyses_completed_idx
  on public.analyses (user_id, completed_at desc)
  where status = 'COMPLETED';

-- ---------------------------------------------------------------------------
-- Mirror auth.users -> public.users on signup.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    now(),
    now()
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(public.users.full_name, excluded.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.users            enable row level security;
alter table public.projects         enable row level security;
alter table public.analyses         enable row level security;
alter table public.ads              enable row level security;
alter table public.ad_clusters      enable row level security;
alter table public.landing_pages    enable row level security;
alter table public.reports          enable row level security;
alter table public.dimension_scores enable row level security;
alter table public.analysis_events  enable row level security;
alter table public.usage_records    enable row level security;
alter table public.api_keys         enable row level security;
alter table public.audit_events     enable row level security;

-- Internal tables: no policies at all => unreachable via anon/authenticated.
alter table public.cache_entries  enable row level security;
alter table public.rate_limits    enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists users_self on public.users;
create policy users_self on public.users
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists analyses_owner on public.analyses;
create policy analyses_owner on public.analyses
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists usage_owner on public.usage_records;
create policy usage_owner on public.usage_records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists api_keys_owner on public.api_keys;
create policy api_keys_owner on public.api_keys
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists audit_owner on public.audit_events;
create policy audit_owner on public.audit_events
  for select to authenticated using (user_id = (select auth.uid()));

-- Children inherit access from their analysis.
create or replace function public.owns_analysis(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.analyses a where a.id = aid and a.user_id = (select auth.uid()));
$$;

do $$
declare t text;
begin
  foreach t in array array['ads','ad_clusters','landing_pages','reports','analysis_events'] loop
    execute format('drop policy if exists %I_via_analysis on public.%I', t, t);
    execute format(
      'create policy %I_via_analysis on public.%I for all to authenticated
         using (public.owns_analysis(analysis_id)) with check (public.owns_analysis(analysis_id))',
      t, t);
  end loop;
end $$;

drop policy if exists dimension_scores_via_report on public.dimension_scores;
create policy dimension_scores_via_report on public.dimension_scores
  for all to authenticated
  using (exists (
    select 1 from public.reports r
    where r.id = dimension_scores.report_id and public.owns_analysis(r.analysis_id)))
  with check (exists (
    select 1 from public.reports r
    where r.id = dimension_scores.report_id and public.owns_analysis(r.analysis_id)));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for ad screenshots, one folder per user.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-screenshots', 'ad-screenshots', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists screenshots_owner on storage.objects;
create policy screenshots_owner on storage.objects
  for all to authenticated
  using (bucket_id = 'ad-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'ad-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Housekeeping: call from a cron job (pg_cron or an external scheduler).
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired()
returns void language sql as $$
  delete from public.cache_entries where expires_at < now();
  delete from public.rate_limits  where expires_at < now();
  delete from public.webhook_events where processed_at < now() - interval '30 days';
$$;
