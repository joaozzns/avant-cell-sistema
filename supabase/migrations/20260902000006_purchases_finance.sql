-- ============================================================
-- AVANT CELL · Módulos 7 e 8 · Compras, fornecedores e financeiro
-- Pedido de compra, contas, fluxo de caixa, conciliação,
-- plano de contas, centros de custo e comissões
-- ============================================================

create type public.po_status         as enum ('draft','sent','confirmed','partial','received','canceled');
create type public.bill_status       as enum ('open','partial','paid','canceled','renegotiated');
create type public.account_type      as enum ('cash','bank','wallet');
create type public.category_kind     as enum ('revenue','cost','expense');
create type public.settlement_status as enum ('pending','matched','divergent','contested');
create type public.commission_status as enum ('accrued','approved','paid','reversed');

-- ---------- Fornecedores ----------
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  name           text not null,
  cnpj           text,
  contact        jsonb not null default '{}'::jsonb,  -- vendedor, telefone, e-mail
  payment_terms  text,
  lead_time_days int,
  categories     text[] not null default '{}',
  brands         text[] not null default '{}',
  documents      jsonb not null default '[]'::jsonb,
  risk_flag      boolean not null default false,      -- muitas peças defeituosas
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index on public.suppliers (company_id);

alter table public.stock_entries add constraint fk_entries_supplier
  foreign key (supplier_id) references public.suppliers(id);
alter table public.os_external_services add constraint fk_ext_supplier
  foreign key (supplier_id) references public.suppliers(id);

create table public.supplier_prices (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  variant_id  uuid references public.product_variants(id),
  cost        numeric(14,4) not null,
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (supplier_id, product_id, variant_id)
);

-- ---------- Pedido de compra ----------
create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  store_id      uuid not null references public.stores(id),
  supplier_id   uuid not null references public.suppliers(id),
  number        bigint not null,
  status        public.po_status not null default 'draft',
  freight       numeric(14,2) not null default 0,
  payment_terms text,
  expected_at   date,
  total         numeric(14,2) not null default 0,
  approved_by   uuid references public.profiles(id),
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (store_id, number)
);
create index on public.purchase_orders (store_id, status);

create table public.purchase_order_items (
  id             uuid primary key default gen_random_uuid(),
  po_id          uuid not null references public.purchase_orders(id) on delete cascade,
  product_id     uuid not null references public.products(id),
  variant_id     uuid references public.product_variants(id),
  qty            numeric(12,3) not null,
  qty_received   numeric(12,3) not null default 0,
  unit_cost      numeric(14,4) not null,
  reservation_id uuid references public.reservations(id),  -- encomenda de cliente
  os_part_id     uuid references public.os_parts(id)       -- peça pedida em OS
);
create index on public.purchase_order_items (po_id);

alter table public.stock_entries add constraint fk_entries_po
  foreign key (purchase_order_id) references public.purchase_orders(id);
alter table public.reservations add constraint fk_reservations_po
  foreign key (purchase_order_id) references public.purchase_orders(id);

-- ---------- Contas e plano de contas ----------
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  store_id        uuid references public.stores(id),
  name            text not null,
  type            public.account_type not null default 'bank',
  bank_info       jsonb not null default '{}'::jsonb,
  initial_balance numeric(14,2) not null default 0,
  active          boolean not null default true
);
create index on public.accounts (company_id);

create table public.finance_categories (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  parent_id  uuid references public.finance_categories(id),
  name       text not null,
  kind       public.category_kind not null,
  active     boolean not null default true
);
create index on public.finance_categories (company_id);

create table public.cost_centers (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  store_id   uuid references public.stores(id),
  name       text not null,        -- loja | assistência | administrativo
  active     boolean not null default true
);

-- ---------- Contas a receber ----------
create table public.receivables (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id),
  store_id           uuid not null references public.stores(id),
  customer_id        uuid references public.customers(id),
  sale_id            uuid references public.sales(id),
  os_id              uuid references public.service_orders(id),
  category_id        uuid references public.finance_categories(id),
  description        text not null,
  installment_no     int not null default 1,
  installments_total int not null default 1,
  due_date           date not null,
  original_due_date  date not null,       -- aging usa a original após renegociação
  amount             numeric(14,2) not null,
  interest           numeric(14,2) not null default 0,
  fine               numeric(14,2) not null default 0,
  discount           numeric(14,2) not null default 0,
  paid_amount        numeric(14,2) not null default 0,
  paid_at            timestamptz,
  account_id         uuid references public.accounts(id),
  cash_session_id    uuid references public.cash_sessions(id),
  status             public.bill_status not null default 'open',
  renegotiated_from  uuid references public.receivables(id),
  notes              text,
  created_at         timestamptz not null default now()
);
create index on public.receivables (store_id, status, due_date);
create index on public.receivables (customer_id, status);
create index on public.receivables (sale_id);

-- ---------- Contas a pagar ----------
create table public.payables (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  store_id       uuid references public.stores(id),
  supplier_id    uuid references public.suppliers(id),
  entry_id       uuid references public.stock_entries(id),
  po_id          uuid references public.purchase_orders(id),
  category_id    uuid references public.finance_categories(id),
  cost_center_id uuid references public.cost_centers(id),
  description    text not null,
  due_date       date not null,
  amount         numeric(14,2) not null,
  paid_amount    numeric(14,2) not null default 0,
  paid_at        timestamptz,
  account_id     uuid references public.accounts(id),
  recurring      jsonb,               -- {every: 'month', day: 5, until: date}
  attachment_url text,
  doc_pending    boolean not null default false,  -- pago sem comprovante
  status         public.bill_status not null default 'open',
  approved_by    uuid references public.profiles(id),
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index on public.payables (company_id, status, due_date);

alter table public.cash_movements add constraint fk_cashmove_payable
  foreign key (payable_id) references public.payables(id);

-- ---------- Extrato / movimentações de conta ----------
create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  account_id       uuid not null references public.accounts(id),
  store_id         uuid references public.stores(id),
  kind             text not null,     -- in | out | transfer_in | transfer_out
  amount           numeric(14,2) not null,
  date             date not null default current_date,
  category_id      uuid references public.finance_categories(id),
  cost_center_id   uuid references public.cost_centers(id),
  ref_table        text,
  ref_id           uuid,
  transfer_pair_id uuid references public.transactions(id),
  reconciled       boolean not null default false,
  description      text,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index on public.transactions (account_id, date desc);

-- ---------- Conciliação de cartões e Pix ----------
create table public.card_settlements (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  store_id        uuid references public.stores(id),
  acquirer        text not null,
  gross           numeric(14,2) not null,
  fee             numeric(14,2) not null default 0,
  net             numeric(14,2) not null,
  expected_date   date,
  received_date   date,
  sale_payment_id uuid references public.sale_payments(id),
  status          public.settlement_status not null default 'pending',
  import_batch    text,
  raw             jsonb,
  created_at      timestamptz not null default now()
);
create index on public.card_settlements (company_id, status);

-- ---------- Comissões ----------
create table public.commission_rules (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id),
  name         text not null,
  scope        jsonb not null default '{}'::jsonb,  -- role, product_id, category_id, service_type
  base         text not null default 'sale',        -- sale | margin | fixed_per_os
  rate         numeric(6,3),
  fixed_amount numeric(14,2),
  only_when_paid boolean not null default true,
  active       boolean not null default true
);

create table public.commission_entries (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  store_id    uuid not null references public.stores(id),
  user_id     uuid not null references public.profiles(id),
  rule_id     uuid references public.commission_rules(id),
  sale_id     uuid references public.sales(id),
  sale_item_id uuid references public.sale_items(id),
  os_id       uuid references public.service_orders(id),
  base_amount numeric(14,2) not null,
  amount      numeric(14,2) not null,
  period      text not null,                        -- 'YYYY-MM'
  status      public.commission_status not null default 'accrued',
  payable_id  uuid references public.payables(id),
  created_at  timestamptz not null default now()
);
create index on public.commission_entries (user_id, period);

-- ---------- Metas ----------
create table public.goals (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  store_id   uuid references public.stores(id),
  user_id    uuid references public.profiles(id),   -- null = meta da loja
  period     text not null,                         -- 'YYYY-MM'
  target     numeric(14,2) not null,
  bonus      numeric(14,2),
  unique nulls not distinct (company_id, store_id, user_id, period)
);
