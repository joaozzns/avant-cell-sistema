-- ============================================================
-- AVANT CELL · Fase 0 · Núcleo: tenancy, usuários, permissões,
-- auditoria e contadores sequenciais por loja
-- ============================================================

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------- Empresa e lojas (multi-tenant) ----------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  trade_name  text,
  cnpj        text unique,
  state_reg   text,          -- inscrição estadual
  phone       text,
  email       text,
  logo_url    text,
  address     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  name          text not null,
  cnpj          text,
  phone         text,
  address       jsonb not null default '{}'::jsonb,
  opening_hours jsonb not null default '{}'::jsonb,
  settings      jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on public.stores (company_id);

-- ---------- Perfis de acesso e permissões ----------
-- Permissões são um catálogo global; papéis podem ser do sistema
-- (company_id null) ou personalizados por empresa.
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id),
  key         text not null,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  unique (company_id, key)
);

create table public.permissions (
  key         text primary key,        -- ex.: 'sales.create', 'products.view_cost'
  module      text not null,
  action      text not null,
  description text
);

create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed        boolean not null default true,
  value_limit    numeric,             -- ex.: desconto máximo %, sangria máxima R$
  primary key (role_id, permission_key)
);

-- ---------- Usuários ----------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  company_id           uuid references public.companies(id),
  full_name            text not null default '',
  email                text,
  phone                text,
  pin_hash             text,          -- PIN do operador (PDV), hash bcrypt
  active               boolean not null default true,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.profiles (company_id);

-- Vínculo usuário ↔ loja com papel por unidade
create table public.user_stores (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  store_id  uuid not null references public.stores(id) on delete cascade,
  role_id   uuid not null references public.roles(id),
  primary key (user_id, store_id)
);
create index on public.user_stores (store_id);

-- ---------- Log de auditoria (append-only) ----------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  company_id  uuid,
  store_id    uuid,
  user_id     uuid,
  action      text not null,           -- insert | update | delete | access | approve | login
  table_name  text not null,
  record_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (company_id, created_at desc);
create index on public.audit_logs (table_name, record_id);
revoke update, delete on public.audit_logs from anon, authenticated;

-- ---------- Numeração sequencial por loja (OS, venda, orçamento) ----------
create table public.store_counters (
  store_id uuid not null references public.stores(id) on delete cascade,
  kind     text not null,              -- 'sale' | 'service_order' | 'quote' | 'purchase_order'
  value    bigint not null default 0,
  primary key (store_id, kind)
);

create or replace function app.next_store_number(p_store uuid, p_kind text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v bigint;
begin
  insert into public.store_counters (store_id, kind, value)
  values (p_store, p_kind, 1)
  on conflict (store_id, kind)
  do update set value = public.store_counters.value + 1
  returning value into v;
  return v;
end;
$$;

-- ---------- Helpers de sessão / RLS ----------
create or replace function app.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function app.user_store_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select store_id from public.user_stores where user_id = auth.uid()
$$;

create or replace function app.has_store(p_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_stores
    where user_id = auth.uid() and store_id = p_store
  )
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_stores us
    join public.roles r on r.id = us.role_id
    where us.user_id = auth.uid() and r.key in ('owner','admin')
  )
$$;

create or replace function app.has_permission(p_perm text, p_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_admin() or exists (
    select 1
    from public.user_stores us
    join public.role_permissions rp on rp.role_id = us.role_id
    where us.user_id = auth.uid()
      and us.store_id = p_store
      and rp.permission_key = p_perm
      and rp.allowed
  )
$$;

create or replace function app.permission_limit(p_perm text, p_store uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select max(rp.value_limit)
  from public.user_stores us
  join public.role_permissions rp on rp.role_id = us.role_id
  where us.user_id = auth.uid()
    and us.store_id = p_store
    and rp.permission_key = p_perm
    and rp.allowed
$$;

-- ---------- Triggers genéricos ----------
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_store   uuid;
  v_record  text;
  v_before  jsonb;
  v_after   jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old); v_after := null;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old); v_after := to_jsonb(new);
  else
    v_before := null; v_after := to_jsonb(new);
  end if;
  v_record := coalesce(v_after ->> 'id', v_before ->> 'id');

  v_company := coalesce((v_after ->> 'company_id')::uuid, (v_before ->> 'company_id')::uuid);
  v_store   := coalesce((v_after ->> 'store_id')::uuid,   (v_before ->> 'store_id')::uuid);

  insert into public.audit_logs (company_id, store_id, user_id, action, table_name, record_id, before, after)
  values (v_company, v_store, auth.uid(), lower(tg_op), tg_table_name, v_record, v_before, v_after);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function app.set_updated_at();

-- Cria o profile automaticamente no signup
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
