-- 023_support_helpdesk.sql
-- Sistema de soporte interno (helpdesk). Productores (sales + office_director)
-- abren consultas; respondedores (admin + reviews_manager) las atienden.
-- Las conversaciones pueden vincularse opcionalmente a una reseña o cliente.

-- ============================================================
-- 1. TABLES
-- ============================================================

create table public.support_conversations (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  -- CHECK constraint (no enum) para evitar 55P04 al añadir categorías.
  category        text not null default 'general'
    check (category in ('general','review_question','technical','billing')),
  status          text not null default 'open'
    check (status in ('open','closed')),
  opener_id       uuid not null references public.profiles(id) on delete cascade,
  -- Vínculo contextual opcional
  linked_review_id  uuid references public.reviews(id) on delete set null,
  linked_client_id  uuid references public.clients(id) on delete set null,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz,
  -- Denormalizado para ordenar la bandeja por actividad sin JOIN+aggregation.
  last_message_at timestamptz not null default now()
);

create index support_conversations_opener_idx
  on public.support_conversations(opener_id);
create index support_conversations_status_activity_idx
  on public.support_conversations(status, last_message_at desc);

create table public.support_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.support_conversations(id) on delete cascade,
  author_id         uuid not null references public.profiles(id) on delete cascade,
  body              text not null,
  created_at        timestamptz not null default now()
);

create index support_messages_thread_idx
  on public.support_messages(conversation_id, created_at asc);

-- Read tracking: una fila por usuario × conversación. UPSERT al abrir.
create table public.support_read_receipts (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  conversation_id   uuid not null references public.support_conversations(id) on delete cascade,
  last_read_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

-- ============================================================
-- 2. RLS
-- ============================================================

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_read_receipts enable row level security;

-- ---- support_conversations ----

-- Admin + reviews_manager: acceso total (son los respondedores).
create policy support_conv_responder_all
  on public.support_conversations for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid())
      in ('admin', 'reviews_manager')
  )
  with check (
    (select role from public.profiles where id = auth.uid())
      in ('admin', 'reviews_manager')
  );

-- Sales: solo ve/crea/actualiza las suyas.
create policy support_conv_sales_select
  on public.support_conversations for select to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'sales'
    and opener_id = auth.uid()
  );

create policy support_conv_sales_insert
  on public.support_conversations for insert to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'sales'
    and opener_id = auth.uid()
  );

create policy support_conv_sales_update
  on public.support_conversations for update to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'sales'
    and opener_id = auth.uid()
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'sales'
    and opener_id = auth.uid()
  );

-- Office director: solo ve/crea/actualiza las suyas (es asker, no responder).
create policy support_conv_director_select
  on public.support_conversations for select to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'office_director'
    and opener_id = auth.uid()
  );

create policy support_conv_director_insert
  on public.support_conversations for insert to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'office_director'
    and opener_id = auth.uid()
  );

create policy support_conv_director_update
  on public.support_conversations for update to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'office_director'
    and opener_id = auth.uid()
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'office_director'
    and opener_id = auth.uid()
  );

-- ---- support_messages ----
-- Hereda visibilidad de la conversación via EXISTS (Postgres evalúa RLS anidada).

create policy support_msg_select
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
    )
  );

-- Cualquiera que vea la conversación puede postear. Fuerza author_id = self.
create policy support_msg_insert
  on public.support_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
    )
  );

-- ---- support_read_receipts ----
-- Solo las propias.

create policy support_read_own
  on public.support_read_receipts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 3. FUNCIÓN: support_unread_count()
-- ============================================================
-- Devuelve el número de conversaciones con mensajes no leídos para el
-- usuario actual. SECURITY DEFINER para leer profiles.role sin RLS
-- (más eficiente). Llamar via supabase.rpc("support_unread_count").

create or replace function public.support_unread_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from support_conversations c
  left join support_read_receipts r
    on r.conversation_id = c.id and r.user_id = auth.uid()
  where
    -- Solo conversaciones abiertas con actividad posterior a la última lectura
    (r.last_read_at is null or c.last_message_at > r.last_read_at)
    -- Scope por rol (misma lógica que las RLS policies)
    and case (select role from profiles where id = auth.uid())
      when 'admin' then true
      when 'reviews_manager' then true
      when 'office_director' then c.opener_id = auth.uid()
      when 'sales' then c.opener_id = auth.uid()
      else false
    end;
$$;

grant execute on function public.support_unread_count() to authenticated;
