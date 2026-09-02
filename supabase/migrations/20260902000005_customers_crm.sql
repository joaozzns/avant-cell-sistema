-- ============================================================
-- AVANT CELL · Módulo 6 · Clientes e CRM
-- Base única, aparelhos do cliente, mensagens, campanhas e NPS
-- ============================================================

create type public.customer_kind  as enum ('person','company');
create type public.message_status as enum ('queued','sent','delivered','read','failed','received');
create type public.device_link_status as enum ('active','sold','traded','lost');

create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  kind            public.customer_kind not null default 'person',
  name            text not null,
  cpf_cnpj        text,
  rg              text,
  birthdate       date,
  email           text,
  phone           text,
  whatsapp        text,
  address         jsonb not null default '{}'::jsonb,
  origin          text,                 -- indicação | redes | passagem | campanha
  notes           text,
  consent_contact boolean not null default false,
  consent_at      timestamptz,
  debt_flag       boolean not null default false,   -- marcação visível no PDV e na OS
  anonymized      boolean not null default false,   -- LGPD
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index uq_customers_doc on public.customers (company_id, cpf_cnpj) where cpf_cnpj is not null;
create index on public.customers (company_id, phone);
create index idx_customers_name_trgm on public.customers using gin (to_tsvector('portuguese', name));

-- FKs pendentes dos módulos anteriores
alter table public.sales        add constraint fk_sales_customer        foreign key (customer_id) references public.customers(id);
alter table public.quotes       add constraint fk_quotes_customer       foreign key (customer_id) references public.customers(id);
alter table public.reservations add constraint fk_reservations_customer foreign key (customer_id) references public.customers(id);
alter table public.store_credits add constraint fk_credits_customer     foreign key (customer_id) references public.customers(id);
alter table public.trade_ins    add constraint fk_tradeins_customer     foreign key (customer_id) references public.customers(id);
alter table public.customer_credit_profiles add constraint fk_ccp_customer foreign key (customer_id) references public.customers(id);
alter table public.service_orders add constraint fk_os_customer         foreign key (customer_id) references public.customers(id);
alter table public.appointments add constraint fk_appt_customer         foreign key (customer_id) references public.customers(id);

-- ---------- Aparelhos do cliente ----------
create table public.customer_devices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  brand_id        uuid references public.brands(id),
  device_model_id uuid references public.device_models(id),
  model_text      text,
  imei            text,
  serial_number   text,
  color           text,
  capacity        text,
  acquired_at     date,
  status          public.device_link_status not null default 'active',
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.customer_devices (customer_id);
create index on public.customer_devices (company_id, imei);
-- um IMEI pertence a um cliente por vez
create unique index uq_customer_device_imei on public.customer_devices (company_id, imei)
  where imei is not null and status = 'active';

alter table public.service_orders add constraint fk_os_device
  foreign key (customer_device_id) references public.customer_devices(id);

-- ---------- Mensagens (WhatsApp / e-mail / SMS) ----------
create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  key        text not null,     -- os_opened | quote_ready | approved | awaiting_part | ready | pickup_reminder | billing | post_sale
  name       text not null,
  channel    text not null default 'whatsapp',
  body       text not null,     -- com variáveis {{nome}}, {{numero_os}}, {{valor}}, {{link}}
  auto_on_status text,          -- dispara ao mudar status da OS
  active     boolean not null default true,
  unique (company_id, key)
);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  store_id    uuid references public.stores(id),
  customer_id uuid references public.customers(id),
  channel     text not null default 'whatsapp',
  direction   text not null default 'out',   -- out | in
  template_key text,
  body        text not null,
  media_url   text,
  ref_table   text,       -- service_orders | sales | receivables
  ref_id      uuid,
  status      public.message_status not null default 'queued',
  error       text,
  user_id     uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.messages (customer_id, created_at desc);
create index on public.messages (ref_table, ref_id);
create index on public.messages (status) where status in ('queued','failed');

-- ---------- Campanhas e automações ----------
create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  name           text not null,
  kind           text not null default 'manual',  -- manual | birthday | post_purchase_30d | inactive_6m | warranty_expiring
  segment        jsonb not null default '{}'::jsonb,
  message        text not null,
  coupon_code    text,
  coupon_value   numeric(14,2),
  coupon_percent numeric(6,3),
  coupon_min_total numeric(14,2),
  coupon_expires date,
  starts_at      timestamptz,
  ends_at        timestamptz,
  frequency_cap  int not null default 2,           -- contatos por cliente/mês
  status         text not null default 'draft',    -- draft | active | paused | done
  created_at     timestamptz not null default now()
);

create table public.campaign_sends (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  sent_at     timestamptz not null default now(),
  responded   boolean not null default false,
  sale_id     uuid references public.sales(id),    -- receita atribuída via cupom
  unique (campaign_id, customer_id)
);

create table public.segments (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id)
);

-- ---------- Pesquisa de satisfação ----------
create table public.surveys (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  store_id      uuid references public.stores(id),
  customer_id   uuid not null references public.customers(id),
  ref_table     text not null,      -- sales | service_orders
  ref_id        uuid not null,
  type          text not null default 'nps',
  score         int,
  comment       text,
  sent_at       timestamptz not null default now(),
  answered_at   timestamptz,
  google_invite_sent boolean not null default false,
  handled_by    uuid references public.profiles(id),
  handling_note text,
  unique (ref_table, ref_id)        -- uma pesquisa por atendimento
);
create index on public.surveys (company_id, answered_at desc);

-- ---------- LGPD ----------
create table public.lgpd_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id),
  customer_id  uuid not null references public.customers(id),
  kind         text not null,        -- export | deletion | anonymization
  status       text not null default 'open',  -- open | done | rejected
  requested_at timestamptz not null default now(),
  due_at       date,
  completed_at timestamptz,
  handled_by   uuid references public.profiles(id),
  notes        text
);

create trigger trg_customers_updated before update on public.customers
  for each row execute function app.set_updated_at();
