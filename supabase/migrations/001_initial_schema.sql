-- ReseñaHub — initial schema
-- Run after creating a fresh Supabase project.

create extension if not exists "pgcrypto";

create type role_enum            as enum ('admin', 'sales', 'reviews_manager');
create type profile_status_enum  as enum ('invited', 'active', 'paused');
create type match_state_enum     as enum ('counted', 'pending', 'unmatched');
create type oauth_status_enum    as enum ('disconnected', 'connected', 'error');
create type share_source_enum    as enum ('whatsapp', 'email', 'sms', 'qr', 'direct');

----------------------------------------------------------------------
-- locations: each row is one Google Business Profile that we manage
----------------------------------------------------------------------
create table public.locations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  google_place_id     text unique,
  google_account_id   text,
  oauth_status        oauth_status_enum not null default 'disconnected',
  created_at          timestamptz not null default now()
);

----------------------------------------------------------------------
-- location_secrets: oauth refresh tokens isolated in their own table
-- so they cannot be selected via PostgREST. RLS is enabled with NO
-- policies — only the service_role key (server-side) can touch this.
----------------------------------------------------------------------
create table public.location_secrets (
  location_id          uuid primary key references public.locations(id) on delete cascade,
  oauth_refresh_token  text,
  oauth_access_token   text,
  expires_at           timestamptz,
  updated_at           timestamptz not null default now()
);

----------------------------------------------------------------------
-- profiles: extends auth.users with role/slug/location
----------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          role_enum not null,
  location_id   uuid references public.locations(id) on delete set null,
  slug          text not null unique,
  email         text,
  phone         text,
  monthly_goal  int not null default 50,
  status        profile_status_enum not null default 'invited',
  avatar_url    text,
  joined_at     timestamptz not null default now(),
  constraint sales_must_have_location
    check (role <> 'sales' or location_id is not null)
);

create index profiles_role_idx     on public.profiles(role);
create index profiles_location_idx on public.profiles(location_id);

----------------------------------------------------------------------
-- clients: people the salesperson is going to invite via link
----------------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  sales_id    uuid not null references public.profiles(id) on delete cascade,
  full_name   text not null,
  slug        text not null,
  email       text,
  phone       text,
  created_at  timestamptz not null default now(),
  unique (sales_id, slug)
);

create index clients_sales_idx on public.clients(sales_id);

----------------------------------------------------------------------
-- share_links: every time the public landing is opened we record it.
-- Multiple openings = multiple rows (we track each "intent").
----------------------------------------------------------------------
create table public.share_links (
  id            uuid primary key default gen_random_uuid(),
  sales_id      uuid not null references public.profiles(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  location_id   uuid not null references public.locations(id) on delete cascade,
  link_token    text not null,                    -- short random token (audit/debug)
  opened_at     timestamptz not null default now(),
  source        share_source_enum not null default 'direct',
  user_agent    text
);

create index share_links_sales_opened_idx    on public.share_links(sales_id, opened_at desc);
create index share_links_location_opened_idx on public.share_links(location_id, opened_at desc);

----------------------------------------------------------------------
-- reviews: the canonical store of detected Google reviews
----------------------------------------------------------------------
create table public.reviews (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references public.locations(id) on delete cascade,
  google_review_id  text not null,
  author_name       text not null,
  rating            int not null check (rating between 1 and 5),
  text              text,
  google_created_at timestamptz not null,
  fetched_at        timestamptz not null default now(),
  sales_id          uuid references public.profiles(id) on delete set null,
  client_id         uuid references public.clients(id) on delete set null,
  share_link_id     uuid references public.share_links(id) on delete set null,
  match_confidence  int not null default 0 check (match_confidence between 0 and 100),
  match_state       match_state_enum not null default 'unmatched',
  match_evidence    jsonb,
  unique (location_id, google_review_id)
);

create index reviews_sales_idx          on public.reviews(sales_id);
create index reviews_location_idx       on public.reviews(location_id);
create index reviews_google_created_idx on public.reviews(google_created_at desc);
create index reviews_match_state_idx    on public.reviews(match_state);

----------------------------------------------------------------------
-- audit_log: trace attribution decisions so we can debug matching
----------------------------------------------------------------------
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  action       text not null,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index audit_log_created_idx on public.audit_log(created_at desc);

----------------------------------------------------------------------
-- helper: SECURITY DEFINER function that returns the caller's role
-- (used by RLS policies; avoids recursive policy lookups on profiles)
----------------------------------------------------------------------
create or replace function public.current_role()
returns role_enum
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_role() to authenticated;
