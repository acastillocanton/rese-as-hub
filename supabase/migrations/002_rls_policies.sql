-- ReseñaHub — Row Level Security policies
-- Apply after 001_initial_schema.sql

alter table public.locations         enable row level security;
alter table public.location_secrets  enable row level security;
alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.share_links       enable row level security;
alter table public.reviews           enable row level security;
alter table public.audit_log         enable row level security;

-- location_secrets: intentionally has NO policies.
-- Only the service_role key (server-side cron + landing route) can read/write.

----------------------------------------------------------------------
-- locations
----------------------------------------------------------------------
create policy locations_admin_all on public.locations
  for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy locations_select_others on public.locations
  for select to authenticated
  using (public.current_role() in ('sales', 'reviews_manager'));

----------------------------------------------------------------------
-- profiles
----------------------------------------------------------------------
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy profiles_self_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy profiles_manager_select on public.profiles
  for select to authenticated
  using (public.current_role() = 'reviews_manager');

----------------------------------------------------------------------
-- clients
----------------------------------------------------------------------
create policy clients_admin_all on public.clients
  for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy clients_sales_own on public.clients
  for all to authenticated
  using (sales_id = auth.uid())
  with check (sales_id = auth.uid());

create policy clients_manager_select on public.clients
  for select to authenticated
  using (public.current_role() = 'reviews_manager');

----------------------------------------------------------------------
-- share_links
----------------------------------------------------------------------
create policy share_links_admin_all on public.share_links
  for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy share_links_sales_own_select on public.share_links
  for select to authenticated
  using (sales_id = auth.uid());

----------------------------------------------------------------------
-- reviews
----------------------------------------------------------------------
create policy reviews_admin_all on public.reviews
  for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy reviews_sales_own_select on public.reviews
  for select to authenticated
  using (sales_id = auth.uid());

create policy reviews_manager_select on public.reviews
  for select to authenticated
  using (public.current_role() = 'reviews_manager');

----------------------------------------------------------------------
-- audit_log: admin only
----------------------------------------------------------------------
create policy audit_log_admin_select on public.audit_log
  for select to authenticated
  using (public.current_role() = 'admin');
