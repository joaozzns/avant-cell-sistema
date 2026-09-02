-- ============================================================
-- AVANT CELL · Módulo 4 · Catálogo e estoque
-- Produtos, variações, IMEI unitário, peças, entradas,
-- transferências, inventário, ajustes e histórico de preço
-- ============================================================

create type public.product_type    as enum ('device','accessory','part','service');
create type public.item_condition  as enum ('new','seminew','showcase','used');
create type public.unit_status     as enum ('available','reserved','sold','in_service','returned','damaged','blocked','in_transit');
create type public.part_quality    as enum ('original','oem','aftermarket','incell','oled');
create type public.stock_move_type as enum (
  'purchase_in','sale_out','sale_return_in','os_use','os_return_in',
  'transfer_out','transfer_in','adjustment_in','adjustment_out',
  'loss','breakage','theft','internal_use','demo','gift',
  'cannibalization','supplier_warranty_out','trade_in'
);
create type public.entry_status    as enum ('draft','completed','reversed');
create type public.transfer_status as enum ('separating','sent','in_transit','received','divergent','canceled');
create type public.inventory_status as enum ('open','counting','review','closed','canceled');

-- ---------- Organização do catálogo ----------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  parent_id  uuid references public.categories(id),
  name       text not null,
  active     boolean not null default true
);
create index on public.categories (company_id);

create table public.brands (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name       text not null,
  logo_url   text,
  active     boolean not null default true,
  unique (company_id, name)
);

create table public.device_models (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  brand_id   uuid references public.brands(id),
  name       text not null,
  year       int,
  screen     text,
  connector  text,
  notes      text,
  active     boolean not null default true
);
create index on public.device_models (company_id, brand_id);

-- ---------- Produtos ----------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  type          public.product_type not null default 'accessory',
  name          text not null,
  description   text,
  category_id   uuid references public.categories(id),
  brand_id      uuid references public.brands(id),
  unit          text not null default 'un',
  internal_code text,
  ean           text,
  supplier_ref  text,
  serialized    boolean not null default false,  -- controle por IMEI/série
  track_stock   boolean not null default true,   -- serviço = false
  part_quality  public.part_quality,
  internal_use_only boolean not null default false, -- peça de bancada fora do PDV
  warranty_days int not null default 90,
  cost          numeric(14,2) not null default 0,
  avg_cost      numeric(14,4) not null default 0,
  markup        numeric(8,4),
  sale_price    numeric(14,2) not null default 0,
  min_price     numeric(14,2) not null default 0,
  wholesale_price numeric(14,2),
  promo_price   numeric(14,2),
  promo_start   date,
  promo_end     date,
  service_minutes int,                            -- tempo estimado (serviços)
  fiscal        jsonb not null default '{}'::jsonb, -- ncm, cest, cfop, origem, cst/csosn, icms, pis, cofins
  photos        jsonb not null default '[]'::jsonb,
  attachments   jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, internal_code)
);
create index on public.products (company_id, type);
create index on public.products (company_id, ean);
create index idx_products_name_trgm on public.products using gin (to_tsvector('portuguese', name));

create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku        text,
  attrs      jsonb not null default '{}'::jsonb,  -- cor, capacidade, voltagem
  ean        text,
  cost       numeric(14,2),
  avg_cost   numeric(14,4),
  sale_price numeric(14,2),
  min_price  numeric(14,2),
  active     boolean not null default true
);
create index on public.product_variants (product_id);

-- Compatibilidade peça/serviço ↔ modelo de aparelho
create table public.product_models (
  product_id      uuid not null references public.products(id) on delete cascade,
  device_model_id uuid not null references public.device_models(id) on delete cascade,
  primary key (product_id, device_model_id)
);

-- Kits e combos: baixa por componente
create table public.kit_items (
  kit_product_id       uuid not null references public.products(id) on delete cascade,
  component_product_id uuid not null references public.products(id),
  variant_id           uuid references public.product_variants(id),
  qty                  numeric(12,3) not null default 1,
  primary key (kit_product_id, component_product_id)
);

-- Histórico de alteração de preço/custo
create table public.price_history (
  id         bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id),
  field      text not null,          -- sale_price | min_price | cost | promo_price
  old_value  numeric(14,4),
  new_value  numeric(14,4),
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index on public.price_history (product_id, created_at desc);

-- ---------- Saldo por loja ----------
create table public.stock_items (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  qty        numeric(12,3) not null default 0,
  reserved   numeric(12,3) not null default 0,
  in_transit numeric(12,3) not null default 0,
  min_qty    numeric(12,3) not null default 0,
  max_qty    numeric(12,3),
  location   text,
  unique nulls not distinct (store_id, product_id, variant_id)
);
create index on public.stock_items (store_id);
create index on public.stock_items (product_id);

-- ---------- Aparelhos com IMEI / número de série (unidade única) ----------
create table public.serialized_units (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  store_id       uuid not null references public.stores(id),
  product_id     uuid not null references public.products(id),
  variant_id     uuid references public.product_variants(id),
  imei1          text,
  imei2          text,
  serial_number  text,
  color          text,
  capacity       text,
  condition      public.item_condition not null default 'new',
  status         public.unit_status not null default 'available',
  origin         text not null default 'purchase',  -- purchase | trade_in | return | warranty | cannibalization
  origin_id      uuid,
  cost           numeric(14,2) not null default 0,
  sale_price     numeric(14,2),
  blocked_reason text,
  notes          text,
  photos         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- IMEI é único no sistema inteiro (por empresa)
create unique index uq_units_imei1 on public.serialized_units (company_id, imei1) where imei1 is not null;
create index on public.serialized_units (store_id, status);
create index on public.serialized_units (product_id);

-- Validação de IMEI pelo dígito verificador (Luhn)
create or replace function app.imei_is_valid(p text)
returns boolean language plpgsql immutable as $$
declare s int := 0; d int; i int; L int;
begin
  if p is null or p !~ '^\d{15}$' then return false; end if;
  L := length(p);
  for i in 1..L loop
    d := (substr(p, L - i + 1, 1))::int;
    if i % 2 = 0 then
      d := d * 2;
      if d > 9 then d := d - 9; end if;
    end if;
    s := s + d;
  end loop;
  return s % 10 = 0;
end;
$$;

alter table public.serialized_units
  add constraint chk_imei1_luhn check (imei1 is null or app.imei_is_valid(imei1));

-- ---------- Movimentações (toda mudança de quantidade tem origem) ----------
create table public.stock_movements (
  id         bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  store_id   uuid not null references public.stores(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  unit_id    uuid references public.serialized_units(id),
  type       public.stock_move_type not null,
  qty        numeric(12,3) not null,
  unit_cost  numeric(14,4),
  ref_table  text,
  ref_id     uuid,
  reason     text,
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index on public.stock_movements (store_id, created_at desc);
create index on public.stock_movements (product_id, created_at desc);
create index on public.stock_movements (ref_table, ref_id);

-- ---------- Entrada de estoque / nota de entrada ----------
create table public.stock_entries (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id),
  store_id          uuid not null references public.stores(id),
  supplier_id       uuid,                          -- FK adicionada no módulo de compras
  purchase_order_id uuid,
  invoice_number    text,
  invoice_key       text,                          -- chave da NF-e
  xml_url           text,
  freight           numeric(14,2) not null default 0,
  insurance         numeric(14,2) not null default 0,
  other_costs       numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  status            public.entry_status not null default 'draft',
  notes             text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index on public.stock_entries (store_id, created_at desc);

create table public.stock_entry_items (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.stock_entries(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  variant_id   uuid references public.product_variants(id),
  qty_expected numeric(12,3) not null default 0,
  qty_received numeric(12,3) not null default 0,
  unit_cost    numeric(14,4) not null default 0,
  imeis        jsonb not null default '[]'::jsonb, -- lidos um a um na conferência
  divergence   text,                               -- falta | avaria | sobra
  photo_url    text
);
create index on public.stock_entry_items (entry_id);

-- ---------- Transferência entre lojas ----------
create table public.transfers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  from_store  uuid not null references public.stores(id),
  to_store    uuid not null references public.stores(id),
  status      public.transfer_status not null default 'separating',
  notes       text,
  created_by  uuid references public.profiles(id),
  sent_at     timestamptz,
  received_at timestamptz,
  created_at  timestamptz not null default now(),
  check (from_store <> to_store)
);
create index on public.transfers (from_store);
create index on public.transfers (to_store);

create table public.transfer_items (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null references public.transfers(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  variant_id   uuid references public.product_variants(id),
  unit_id      uuid references public.serialized_units(id),
  qty          numeric(12,3) not null default 1,
  qty_received numeric(12,3),
  divergence   text
);
create index on public.transfer_items (transfer_id);

-- ---------- Inventário ----------
create table public.inventories (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  store_id   uuid not null references public.stores(id),
  scope      jsonb not null default '{}'::jsonb,   -- total | categoria | marca | localização
  blind      boolean not null default true,
  status     public.inventory_status not null default 'open',
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);

create table public.inventory_items (
  id           uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  variant_id   uuid references public.product_variants(id),
  system_qty   numeric(12,3) not null default 0,
  counted_qty  numeric(12,3),
  second_count numeric(12,3),
  final_qty    numeric(12,3),
  diff_value   numeric(14,2),
  counted_by   uuid references public.profiles(id)
);
create index on public.inventory_items (inventory_id);

-- ---------- Ajustes e perdas ----------
create table public.stock_adjustments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  store_id       uuid not null references public.stores(id),
  product_id     uuid not null references public.products(id),
  variant_id     uuid references public.product_variants(id),
  unit_id        uuid references public.serialized_units(id),
  type           public.stock_move_type not null,
  qty            numeric(12,3) not null,
  reason         text not null,
  attachment_url text,
  value_impact   numeric(14,2),
  approved_by    uuid references public.profiles(id),
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index on public.stock_adjustments (store_id, created_at desc);

create trigger trg_products_updated before update on public.products
  for each row execute function app.set_updated_at();
create trigger trg_units_updated before update on public.serialized_units
  for each row execute function app.set_updated_at();

-- Histórico automático de preço
create or replace function app.track_price_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sale_price is distinct from old.sale_price then
    insert into public.price_history (company_id, product_id, field, old_value, new_value, user_id)
    values (new.company_id, new.id, 'sale_price', old.sale_price, new.sale_price, auth.uid());
  end if;
  if new.min_price is distinct from old.min_price then
    insert into public.price_history (company_id, product_id, field, old_value, new_value, user_id)
    values (new.company_id, new.id, 'min_price', old.min_price, new.min_price, auth.uid());
  end if;
  if new.cost is distinct from old.cost then
    insert into public.price_history (company_id, product_id, field, old_value, new_value, user_id)
    values (new.company_id, new.id, 'cost', old.cost, new.cost, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_products_price_history before update on public.products
  for each row execute function app.track_price_changes();
