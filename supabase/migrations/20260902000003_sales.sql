-- ============================================================
-- AVANT CELL · Módulo 3 · PDV e vendas
-- Caixa, venda, pagamento misto, orçamento, devolução,
-- crediário, reservas, vales e trade-in
-- ============================================================

create type public.sale_status         as enum ('open','held','completed','canceled','returned','partially_returned');
create type public.payment_kind        as enum ('cash','pix','debit','credit','credit_installments','wallet','store_credit','credit_plan','transfer','voucher');
create type public.payment_status      as enum ('pending','confirmed','refunded','failed');
create type public.cash_session_status as enum ('open','closed','reopened');
create type public.cash_move_type      as enum ('sale','withdrawal','supply','receivable_payment','refund','opening');
create type public.quote_status        as enum ('open','sent','approved','rejected','expired','converted');
create type public.reservation_status  as enum ('awaiting_purchase','on_the_way','available','delivered','canceled','expired');
create type public.return_reason       as enum ('defect','regret','wrong_item','warranty');
create type public.return_destination  as enum ('stock','damage','supplier_warranty','os');

-- ---------- Formas de pagamento configuráveis ----------
create table public.payment_methods (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  kind            public.payment_kind not null,
  name            text not null,
  fee_percent     numeric(6,3) not null default 0,
  days_to_receive int not null default 0,
  installments    jsonb not null default '[]'::jsonb, -- [{n, fee_percent, days}]
  pix_key         text,
  active          boolean not null default true
);
create index on public.payment_methods (company_id);

-- ---------- Caixa ----------
create table public.cash_sessions (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  store_id       uuid not null references public.stores(id),
  opened_by      uuid not null references public.profiles(id),
  status         public.cash_session_status not null default 'open',
  opening_amount numeric(14,2) not null default 0,
  expected       jsonb,   -- por forma de pagamento, no fechamento
  counted        jsonb,   -- contagem cega do operador
  difference     numeric(14,2),
  justification  text,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  closed_by      uuid references public.profiles(id),
  reopened_by    uuid references public.profiles(id),
  reopen_reason  text
);
create index on public.cash_sessions (store_id, opened_at desc);
-- um caixa aberto por operador por unidade
create unique index uq_open_session on public.cash_sessions (store_id, opened_by) where status = 'open';

create table public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.cash_sessions(id),
  store_id    uuid not null references public.stores(id),
  type        public.cash_move_type not null,
  amount      numeric(14,2) not null,
  reason      text,
  destination text,             -- cofre | banco | despesa
  receipt_url text,
  payable_id  uuid,             -- sangria p/ despesa gera contas a pagar
  ref_id      uuid,             -- venda / recebimento vinculado
  approved_by uuid references public.profiles(id),
  user_id     uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.cash_movements (session_id);

-- ---------- Venda ----------
create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  store_id        uuid not null references public.stores(id),
  number          bigint not null,
  status          public.sale_status not null default 'open',
  customer_id     uuid,                             -- FK no módulo clientes
  seller_id       uuid references public.profiles(id),
  cash_session_id uuid references public.cash_sessions(id),
  subtotal        numeric(14,2) not null default 0,
  discount        numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  notes           text,
  source          text not null default 'pdv',      -- pdv | os | quote | reservation | portal
  source_id       uuid,
  fiscal_doc_id   uuid,
  no_invoice      boolean not null default false,   -- venda "sem nota"
  canceled_reason text,
  canceled_by     uuid references public.profiles(id),
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  unique (store_id, number)
);
create index on public.sales (store_id, created_at desc);
create index on public.sales (customer_id);

create table public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  variant_id   uuid references public.product_variants(id),
  unit_id      uuid references public.serialized_units(id),  -- aparelho IMEI
  qty          numeric(12,3) not null default 1,
  unit_price   numeric(14,2) not null,
  unit_cost    numeric(14,4) not null default 0,              -- custo médio congelado na venda
  discount     numeric(14,2) not null default 0,
  total        numeric(14,2) not null,
  note         text,
  returned_qty numeric(12,3) not null default 0,
  removed_reason text                                          -- item cancelado no carrinho gera log
);
create index on public.sale_items (sale_id);
create index on public.sale_items (unit_id);

create table public.sale_payments (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.sales(id) on delete cascade,
  method_id     uuid references public.payment_methods(id),
  kind          public.payment_kind not null,
  status        public.payment_status not null default 'confirmed',
  amount        numeric(14,2) not null,
  installments  int not null default 1,
  card_brand    text,
  fee_percent   numeric(6,3) not null default 0,
  net_amount    numeric(14,2),
  expected_date date,
  auth_code     text,
  pix_txid      text,
  change_given  numeric(14,2) not null default 0
);
create index on public.sale_payments (sale_id);

-- ---------- Orçamento de venda ----------
create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  store_id         uuid not null references public.stores(id),
  number           bigint not null,
  customer_id      uuid,
  seller_id        uuid references public.profiles(id),
  status           public.quote_status not null default 'open',
  valid_until      date,
  reserve_stock    boolean not null default false,
  rejection_reason text,
  notes            text,
  total            numeric(14,2) not null default 0,
  converted_sale_id uuid references public.sales(id),
  created_at       timestamptz not null default now(),
  unique (store_id, number)
);

create table public.quote_items (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid not null references public.quotes(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  qty        numeric(12,3) not null default 1,
  unit_price numeric(14,2) not null,
  discount   numeric(14,2) not null default 0,
  total      numeric(14,2) not null
);

-- ---------- Devolução e troca ----------
create table public.sale_returns (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  store_id         uuid not null references public.stores(id),
  sale_id          uuid not null references public.sales(id),
  reason           public.return_reason not null,
  refund_kind      public.payment_kind not null,
  total            numeric(14,2) not null default 0,
  exchange_sale_id uuid references public.sales(id),  -- troca gera nova venda
  fiscal_doc_id    uuid,                               -- nota de entrada da devolução
  notes            text,
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index on public.sale_returns (sale_id);

create table public.sale_return_items (
  id           uuid primary key default gen_random_uuid(),
  return_id    uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id),
  qty          numeric(12,3) not null,
  destination  public.return_destination not null default 'stock'
);

-- ---------- Crediário ----------
create table public.customer_credit_profiles (
  customer_id    uuid primary key,                 -- FK no módulo clientes
  company_id     uuid not null references public.companies(id),
  credit_limit   numeric(14,2) not null default 0,
  declared_income numeric(14,2),
  internal_score int,
  blocked        boolean not null default false,
  blocked_reason text,
  notes          text,
  updated_at     timestamptz not null default now()
);

-- Parcelas do crediário vivem em receivables (módulo financeiro),
-- vinculadas à venda pelo sale_id.

-- ---------- Vale / crédito de loja ----------
create table public.store_credits (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  store_id    uuid not null references public.stores(id),
  customer_id uuid not null,
  amount      numeric(14,2) not null,
  balance     numeric(14,2) not null,
  origin      text not null default 'return',      -- return | deposit | campaign
  origin_id   uuid,
  expires_at  date,
  created_at  timestamptz not null default now()
);
create index on public.store_credits (customer_id);

-- ---------- Reservas e encomendas ----------
create table public.reservations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id),
  store_id          uuid not null references public.stores(id),
  customer_id       uuid not null,
  product_id        uuid references public.products(id),
  variant_id        uuid references public.product_variants(id),
  description       text,                          -- modelo desejado em texto livre
  agreed_price      numeric(14,2),
  deposit_amount    numeric(14,2) not null default 0,
  deposit_policy    text,                          -- regra de retenção/devolução do sinal
  status            public.reservation_status not null default 'awaiting_purchase',
  purchase_order_id uuid,
  unit_id           uuid references public.serialized_units(id),
  pickup_deadline   date,
  notified_at       timestamptz,
  sale_id           uuid references public.sales(id),
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create index on public.reservations (store_id, status);

-- ---------- Compra de usado (trade-in) ----------
create table public.trade_ins (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  store_id         uuid not null references public.stores(id),
  customer_id      uuid,                            -- vendedor (pessoa)
  seller_name      text not null,
  seller_cpf       text not null,
  seller_rg        text,
  doc_photo_url    text not null,                   -- obrigatório
  brand            text not null,
  model            text not null,
  imei             text not null,
  color            text,
  capacity         text,
  condition        public.item_condition not null default 'used',
  accessories      jsonb not null default '[]'::jsonb,
  checklist        jsonb not null default '{}'::jsonb, -- tela, bateria, câmeras, botões, biometria, carga
  imei_check       jsonb,                           -- resultado da consulta de bloqueio/roubo
  imei_check_ok    boolean not null default false,
  device_photos    jsonb not null default '[]'::jsonb,
  paid_amount      numeric(14,2) not null,
  payment_kind     public.payment_kind not null default 'cash',
  suggested_price  numeric(14,2),
  term_url         text,
  signature_url    text,
  unit_id          uuid references public.serialized_units(id), -- unidade gerada no estoque
  revision_os_id   uuid,                            -- OS de recondicionamento
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index on public.trade_ins (store_id, created_at desc);
