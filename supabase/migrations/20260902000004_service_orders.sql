-- ============================================================
-- AVANT CELL · Módulo 5 · Assistência técnica (OS)
-- Check-in, diagnóstico, orçamento versionado com aprovação,
-- bancada, peças, laboratório externo, entrega e garantia
-- ============================================================

create type public.os_status as enum (
  'open','diagnosing','awaiting_approval','approved','awaiting_part',
  'repairing','testing','ready','delivered','canceled','unrepaired'
);
create type public.os_priority       as enum ('normal','urgent');
create type public.os_quote_status   as enum ('draft','sent','approved','partially_approved','rejected','superseded','expired');
create type public.os_part_status    as enum ('requested','reserved','applied','returned','defective','purchase_needed');
create type public.external_status   as enum ('sent','in_analysis','quoted','approved','in_repair','returning','received');
create type public.diag_classification as enum ('repairable','unrepairable','uneconomic');
create type public.return_class      as enum ('same_defect','new_defect','misuse','liquid_damage');
create type public.appointment_status as enum ('scheduled','confirmed','done','no_show','canceled');

-- ---------- Ordem de serviço ----------
create table public.service_orders (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id),
  store_id            uuid not null references public.stores(id),
  number              bigint not null,
  status              public.os_status not null default 'open',
  priority            public.os_priority not null default 'normal',
  customer_id         uuid not null,               -- FK no módulo clientes
  customer_device_id  uuid,                        -- FK no módulo clientes
  technician_id       uuid references public.profiles(id),
  -- check-in
  reported_issue      text not null,
  symptom_tags        text[] not null default '{}',
  entry_checklist     jsonb not null default '{}'::jsonb,
  entry_photos        jsonb not null default '[]'::jsonb,   -- obrigatórias
  accessories         jsonb not null default '[]'::jsonb,
  device_password     text,
  password_not_given  boolean not null default false,
  internal_state_unknown boolean not null default false,    -- aparelho que não liga
  imei_check          jsonb,
  terms_version       int,
  entry_signature_url text,
  -- prazos e valores
  estimated_price     numeric(14,2),
  deadline            timestamptz,
  diagnosis_fee       numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  cost_parts          numeric(14,2) not null default 0,
  cost_labor          numeric(14,2) not null default 0,
  cost_external       numeric(14,2) not null default 0,
  -- entrega
  exit_checklist      jsonb,
  exit_photos         jsonb not null default '[]'::jsonb,
  delivered_at        timestamptz,
  delivered_to        text,                        -- titular ou terceiro autorizado
  delivered_doc       text,
  delivery_signature_url text,
  sale_id             uuid references public.sales(id),     -- cobrança gera venda
  -- garantia
  warranty_days       int not null default 90,
  warranty_until      date,
  original_os_id      uuid references public.service_orders(id), -- OS de retorno/garantia
  return_class        public.return_class,
  -- acompanhamento público
  public_token        uuid not null unique default gen_random_uuid(),
  canceled_reason     text,
  charged_diagnosis   boolean not null default false,
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, number)
);
create index on public.service_orders (store_id, status);
create index on public.service_orders (customer_id);
create index on public.service_orders (technician_id, status);
create index on public.service_orders (deadline) where status not in ('delivered','canceled');

create table public.os_status_history (
  id          bigint generated always as identity primary key,
  os_id       uuid not null references public.service_orders(id) on delete cascade,
  from_status public.os_status,
  to_status   public.os_status not null,
  user_id     uuid,
  note        text,
  created_at  timestamptz not null default now()
);
create index on public.os_status_history (os_id);

-- Transições válidas de status
create or replace function app.os_transition_valid(p_from public.os_status, p_to public.os_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('open','diagnosing'), ('open','canceled'),
    ('diagnosing','awaiting_approval'), ('diagnosing','unrepaired'), ('diagnosing','canceled'),
    ('awaiting_approval','approved'), ('awaiting_approval','canceled'), ('awaiting_approval','unrepaired'),
    ('approved','awaiting_part'), ('approved','repairing'),
    ('awaiting_part','repairing'),
    ('repairing','testing'), ('repairing','awaiting_part'),
    ('testing','ready'), ('testing','repairing'),
    ('ready','delivered'),
    ('unrepaired','delivered')
  )
$$;

create or replace function app.enforce_os_transition()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status
     and not app.os_transition_valid(old.status, new.status) then
    raise exception 'Transição de status inválida: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;
create trigger trg_os_transition before update on public.service_orders
  for each row execute function app.enforce_os_transition();

create or replace function app.log_os_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status then
    insert into public.os_status_history (os_id, from_status, to_status, user_id)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_os_status_log after update on public.service_orders
  for each row execute function app.log_os_status();

-- ---------- Diagnóstico e laudo ----------
create table public.os_diagnostics (
  id             uuid primary key default gen_random_uuid(),
  os_id          uuid not null references public.service_orders(id) on delete cascade,
  found_issue    text not null,
  probable_cause text,
  procedure      text,
  tests          jsonb not null default '[]'::jsonb,  -- [{item, resultado}]
  classification public.diag_classification not null default 'repairable',
  oxidation      boolean not null default false,
  media          jsonb not null default '[]'::jsonb,  -- fotos/vídeos internos
  repair_estimate_minutes int,
  report_pdf_url text,
  technician_id  uuid not null references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index on public.os_diagnostics (os_id);

-- ---------- Orçamento da OS (versionado) ----------
create table public.os_quotes (
  id                uuid primary key default gen_random_uuid(),
  os_id             uuid not null references public.service_orders(id) on delete cascade,
  version           int not null default 1,
  status            public.os_quote_status not null default 'draft',
  valid_until       date,
  execution_days    int,
  total             numeric(14,2) not null default 0,
  sent_at           timestamptz,
  decided_at        timestamptz,
  approval_channel  text,               -- link | in_person
  approval_ip       inet,
  approval_signature_url text,
  rejection_reason  text,
  return_device     boolean,            -- recusou e quer o aparelho de volta
  unique (os_id, version)
);

create table public.os_quote_items (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.os_quotes(id) on delete cascade,
  kind         text not null default 'part',  -- part | labor | service | third_party
  product_id   uuid references public.products(id),
  variant_id   uuid references public.product_variants(id),
  description  text not null,
  quality      public.part_quality,
  qty          numeric(12,3) not null default 1,
  unit_price   numeric(14,2) not null,
  warranty_days int not null default 90,
  approved     boolean                       -- aprovação parcial item a item
);
create index on public.os_quote_items (quote_id);

-- ---------- Peças da OS ----------
create table public.os_parts (
  id             uuid primary key default gen_random_uuid(),
  os_id          uuid not null references public.service_orders(id) on delete cascade,
  product_id     uuid not null references public.products(id),
  variant_id     uuid references public.product_variants(id),
  status         public.os_part_status not null default 'requested',
  qty            numeric(12,3) not null default 1,
  unit_cost      numeric(14,4) not null default 0,
  unit_price     numeric(14,2) not null default 0,
  warranty_days  int not null default 90,
  technician_id  uuid references public.profiles(id),
  applied_at     timestamptz,
  defect_note    text,
  supplier_claim boolean not null default false,  -- pendência de troca com fornecedor
  created_at     timestamptz not null default now()
);
create index on public.os_parts (os_id);

-- ---------- Apontamento de horas (cronômetro) ----------
create table public.os_labor_logs (
  id            uuid primary key default gen_random_uuid(),
  os_id         uuid not null references public.service_orders(id) on delete cascade,
  technician_id uuid not null references public.profiles(id),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  minutes       int,
  note          text
);
create index on public.os_labor_logs (os_id);
create index on public.os_labor_logs (technician_id, started_at desc);

-- ---------- Laboratório externo ----------
create table public.os_external_services (
  id            uuid primary key default gen_random_uuid(),
  os_id         uuid not null references public.service_orders(id) on delete cascade,
  partner_name  text not null,
  supplier_id   uuid,
  status        public.external_status not null default 'sent',
  sent_at       timestamptz not null default now(),
  promised_at   date,
  agreed_cost   numeric(14,2),
  tracking_code text,
  sent_photos   jsonb not null default '[]'::jsonb,
  return_photos jsonb not null default '[]'::jsonb,
  received_at   timestamptz,
  divergence    text,
  notes         text
);
create index on public.os_external_services (os_id);

-- ---------- Comentários e anexos ----------
create table public.os_comments (
  id         uuid primary key default gen_random_uuid(),
  os_id      uuid not null references public.service_orders(id) on delete cascade,
  internal   boolean not null default true,   -- interno não aparece no link público
  message    text not null,
  user_id    uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.os_comments (os_id);

create table public.os_attachments (
  id         uuid primary key default gen_random_uuid(),
  os_id      uuid not null references public.service_orders(id) on delete cascade,
  kind       text not null default 'file',   -- photo | video | pdf | term | report
  url        text not null,
  label      text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Tentativas de contato / aparelhos não retirados ----------
create table public.os_contact_attempts (
  id         uuid primary key default gen_random_uuid(),
  os_id      uuid not null references public.service_orders(id) on delete cascade,
  kind       text not null default 'pickup_reminder', -- pickup_reminder | collection | formal_notice
  channel    text not null default 'whatsapp',
  note       text,
  response   text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Destino de aparelho abandonado fica registrado na própria OS via
-- os_comments + stock_adjustments (cannibalization) + audit_logs.

-- ---------- Agenda e fila ----------
create table public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id),
  store_id           uuid not null references public.stores(id),
  customer_id        uuid not null,
  technician_id      uuid references public.profiles(id),
  service_product_id uuid references public.products(id),
  scheduled_at       timestamptz not null,
  duration_min       int not null default 30,
  status             public.appointment_status not null default 'scheduled',
  os_id              uuid references public.service_orders(id),
  notes              text,
  created_at         timestamptz not null default now()
);
create index on public.appointments (store_id, scheduled_at);

create trigger trg_os_updated before update on public.service_orders
  for each row execute function app.set_updated_at();
