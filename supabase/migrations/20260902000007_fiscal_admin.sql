-- ============================================================
-- AVANT CELL · Módulos 9 e 11 · Fiscal, integrações, alertas,
-- configurações e termos versionados
-- ============================================================

create type public.fiscal_doc_kind   as enum ('nfce','nfe','nfse');
create type public.fiscal_doc_status as enum ('pending','authorized','rejected','canceled','denied','contingency','voided');
create type public.alert_status     as enum ('open','resolved','snoozed','ignored');

-- ---------- Configuração fiscal ----------
create table public.fiscal_settings (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  store_id         uuid references public.stores(id),   -- null = padrão da empresa
  tax_regime       text,                -- simples | presumido | real
  default_csosn    text,
  environment      text not null default 'homolog',     -- homolog | production
  series           jsonb not null default '{}'::jsonb,  -- por tipo de documento
  certificate_ref  text,                -- caminho no storage (A1)
  certificate_expires_at date,
  iss_rate         numeric(6,3),
  service_code     text,                -- código de serviço municipal
  city_code        text,
  updated_at       timestamptz not null default now(),
  unique nulls not distinct (company_id, store_id)
);

create table public.fiscal_operations (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name       text not null,
  kind       text not null,   -- sale | return | repair_send | repair_return | transfer
  cfop       text not null,
  active     boolean not null default true
);

-- Regras tributárias por categoria (NCM, CEST, ICMS, PIS/COFINS, ST)
create table public.tax_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  category_id uuid references public.categories(id),
  rules       jsonb not null default '{}'::jsonb,
  valid_from  date not null default current_date,
  valid_to    date,
  created_at  timestamptz not null default now()
);

-- ---------- Documentos fiscais ----------
create table public.fiscal_documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  store_id         uuid not null references public.stores(id),
  kind             public.fiscal_doc_kind not null,
  status           public.fiscal_doc_status not null default 'pending',
  number           bigint,
  series           text,
  environment      text not null default 'production',
  sale_id          uuid references public.sales(id),
  os_id            uuid references public.service_orders(id),
  return_id        uuid references public.sale_returns(id),
  entry_id         uuid references public.stock_entries(id),
  total            numeric(14,2),
  access_key       text,
  protocol         text,
  xml_url          text,          -- guardado pelo prazo legal, nunca apagado
  pdf_url          text,
  rejection_reason text,
  correction_letters jsonb not null default '[]'::jsonb,
  gateway_payload  jsonb,
  issued_at        timestamptz,
  canceled_at      timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now()
);
create index on public.fiscal_documents (store_id, status);
create index on public.fiscal_documents (sale_id);
alter table public.sales add constraint fk_sales_fiscal
  foreign key (fiscal_doc_id) references public.fiscal_documents(id);
alter table public.sale_returns add constraint fk_returns_fiscal
  foreign key (fiscal_doc_id) references public.fiscal_documents(id);

-- ---------- Integrações ----------
create table public.integrations (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kind       text not null,     -- whatsapp | fiscal_gateway | acquirer | pix | tef | bank | marketplace | imei_check | webhook
  name       text not null,
  config     jsonb not null default '{}'::jsonb,  -- chaves criptografadas na aplicação
  status     text not null default 'disabled',    -- connected | error | disabled
  last_error text,
  updated_at timestamptz not null default now(),
  unique (company_id, kind, name)
);

-- ---------- Central de alertas e pendências ----------
create table public.alerts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id),
  store_id     uuid references public.stores(id),
  kind         text not null,   -- low_stock | os_awaiting_48h | not_picked_up | fiscal_rejected | unreconciled | overdue_bill | inventory_divergence | certificate_expiring
  severity     text not null default 'warning',   -- info | warning | critical
  title        text not null,
  body         text,
  ref_table    text,
  ref_id       uuid,
  status       public.alert_status not null default 'open',
  snooze_until timestamptz,
  assigned_to  uuid references public.profiles(id),
  resolved_by  uuid references public.profiles(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.alerts (company_id, status, created_at desc);

-- ---------- Configurações gerais (chave/valor por loja) ----------
create table public.settings (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  store_id   uuid references public.stores(id),   -- null = global da empresa
  key        text not null,
  value      jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (company_id, store_id, key)
);

-- ---------- Termos versionados (OS antiga mantém a versão assinada) ----------
create table public.terms (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kind       text not null,     -- service_term | warranty_term | exchange_policy | privacy_policy | receipt_message
  version    int not null default 1,
  body       text not null,
  active     boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (company_id, kind, version)
);

-- ---------- Buckets de storage ----------
insert into storage.buckets (id, name, public) values
  ('os-media',   'os-media',   false),   -- fotos/vídeos de OS e laudos
  ('products',   'products',   true),    -- fotos de produtos
  ('documents',  'documents',  false),   -- termos assinados, docs de trade-in (acesso restrito)
  ('fiscal',     'fiscal',     false),   -- XML, DANFE, certificados
  ('branding',   'branding',   true)     -- logo da empresa
on conflict (id) do nothing;
