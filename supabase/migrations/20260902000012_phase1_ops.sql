-- ============================================================
-- AVANT CELL · Fase 1 · Operações transacionais
-- Ajuste de estoque, venda completa e fechamento cego de caixa
-- Todas SECURITY INVOKER: a RLS do usuário continua valendo.
-- ============================================================

-- ---------- Ajuste de estoque (upsert saldo + movimento, atômico) ----------
create or replace function public.stock_adjust(
  p_store   uuid,
  p_product uuid,
  p_variant uuid,
  p_qty     numeric,              -- com sinal: entrada > 0, saída < 0
  p_type    public.stock_move_type,
  p_reason  text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.stores where id = p_store;
  if v_company is null then
    raise exception 'Loja não encontrada';
  end if;

  insert into public.stock_items (store_id, product_id, variant_id, qty)
  values (p_store, p_product, p_variant, p_qty)
  on conflict (store_id, product_id, variant_id) do update
    set qty = public.stock_items.qty + excluded.qty;

  insert into public.stock_movements
    (company_id, store_id, product_id, variant_id, type, qty, reason, user_id)
  values
    (v_company, p_store, p_product, p_variant, p_type, p_qty, p_reason, auth.uid());
end;
$$;
grant execute on function public.stock_adjust(uuid, uuid, uuid, numeric, public.stock_move_type, text) to authenticated;

-- ---------- Venda completa (PDV) ----------
-- payload:
-- { store_id, customer_id?, seller_id?, cash_session_id, discount?, notes?,
--   items:    [{product_id, variant_id?, unit_id?, qty, unit_price, discount?}],
--   payments: [{kind, method_id?, amount, installments?, fee_percent?, change_given?}] }
create or replace function public.complete_sale(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store    uuid := (p ->> 'store_id')::uuid;
  v_session  uuid := (p ->> 'cash_session_id')::uuid;
  v_company  uuid;
  v_sale     uuid;
  v_number   bigint;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce((p ->> 'discount')::numeric, 0);
  v_total    numeric;
  v_paid     numeric := 0;
  v_cash_in  numeric := 0;
  it         jsonb;
  pay        jsonb;
  v_prod     record;
  v_unit     record;
  v_item_total numeric;
  v_cost     numeric;
begin
  select company_id into v_company from public.stores where id = v_store;
  if v_company is null then
    raise exception 'Loja não encontrada';
  end if;

  -- Sem caixa aberto não há venda
  perform 1 from public.cash_sessions
   where id = v_session and store_id = v_store and status = 'open';
  if not found then
    raise exception 'Não há caixa aberto para esta operação';
  end if;

  if jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Venda sem itens';
  end if;

  -- Valida itens e calcula subtotal
  for it in select * from jsonb_array_elements(p -> 'items') loop
    select id, name, type, track_stock, serialized, sale_price, min_price,
           coalesce(nullif(avg_cost, 0), cost) as eff_cost, active
      into v_prod
      from public.products
     where id = (it ->> 'product_id')::uuid and company_id = v_company;
    if not found then
      raise exception 'Produto inválido';
    end if;
    if not v_prod.active then
      raise exception 'Produto inativo: %', v_prod.name;
    end if;

    v_item_total := (it ->> 'qty')::numeric * (it ->> 'unit_price')::numeric
                    - coalesce((it ->> 'discount')::numeric, 0);
    if v_item_total < 0 then
      raise exception 'Desconto maior que o valor do item: %', v_prod.name;
    end if;

    -- Preço mínimo: só vende abaixo com permissão
    if (it ->> 'unit_price')::numeric < v_prod.min_price
       and not app.has_permission('sales.below_min_price', v_store) then
      raise exception 'Preço abaixo do mínimo para %: exige autorização de gerente', v_prod.name;
    end if;

    v_subtotal := v_subtotal + v_item_total;
  end loop;

  v_total := v_subtotal - v_discount;
  if v_total < 0 then
    raise exception 'Desconto maior que o total da venda';
  end if;

  -- Pagamentos precisam fechar com o total
  for pay in select * from jsonb_array_elements(p -> 'payments') loop
    v_paid := v_paid + (pay ->> 'amount')::numeric
              - coalesce((pay ->> 'change_given')::numeric, 0);
  end loop;
  if round(v_paid, 2) <> round(v_total, 2) then
    raise exception 'Pagamentos (%) não fecham com o total (%)', v_paid, v_total;
  end if;

  -- Cria a venda
  v_number := app.next_store_number(v_store, 'sale');
  insert into public.sales
    (company_id, store_id, number, status, customer_id, seller_id,
     cash_session_id, subtotal, discount, total, notes, created_by, completed_at)
  values
    (v_company, v_store, v_number, 'completed',
     nullif(p ->> 'customer_id', '')::uuid,
     coalesce(nullif(p ->> 'seller_id', '')::uuid, auth.uid()),
     v_session, v_subtotal, v_discount, v_total,
     nullif(p ->> 'notes', ''), auth.uid(), now())
  returning id into v_sale;

  -- Itens + baixa de estoque
  for it in select * from jsonb_array_elements(p -> 'items') loop
    select id, track_stock, serialized,
           coalesce(nullif(avg_cost, 0), cost) as eff_cost
      into v_prod
      from public.products
     where id = (it ->> 'product_id')::uuid;

    v_cost := v_prod.eff_cost;
    v_item_total := (it ->> 'qty')::numeric * (it ->> 'unit_price')::numeric
                    - coalesce((it ->> 'discount')::numeric, 0);

    if nullif(it ->> 'unit_id', '') is not null then
      -- Aparelho com IMEI: unitário, nunca por quantidade
      select id, status, cost into v_unit
        from public.serialized_units
       where id = (it ->> 'unit_id')::uuid and store_id = v_store
         for update;
      if not found then
        raise exception 'Aparelho não encontrado nesta loja';
      end if;
      if v_unit.status <> 'available' then
        raise exception 'Aparelho não está disponível para venda (status: %)', v_unit.status;
      end if;
      if (it ->> 'qty')::numeric <> 1 then
        raise exception 'Aparelho com IMEI sai de forma unitária';
      end if;
      update public.serialized_units set status = 'sold' where id = v_unit.id;
      v_cost := v_unit.cost;
      insert into public.stock_movements
        (company_id, store_id, product_id, variant_id, unit_id, type, qty, unit_cost, ref_table, ref_id, user_id)
      values
        (v_company, v_store, v_prod.id, nullif(it ->> 'variant_id','')::uuid, v_unit.id,
         'sale_out', -1, v_cost, 'sales', v_sale, auth.uid());
    elsif v_prod.track_stock then
      insert into public.stock_items (store_id, product_id, variant_id, qty)
      values (v_store, v_prod.id, nullif(it ->> 'variant_id','')::uuid, -((it ->> 'qty')::numeric))
      on conflict (store_id, product_id, variant_id) do update
        set qty = public.stock_items.qty - (it ->> 'qty')::numeric;
      insert into public.stock_movements
        (company_id, store_id, product_id, variant_id, type, qty, unit_cost, ref_table, ref_id, user_id)
      values
        (v_company, v_store, v_prod.id, nullif(it ->> 'variant_id','')::uuid,
         'sale_out', -((it ->> 'qty')::numeric), v_cost, 'sales', v_sale, auth.uid());
    end if;

    insert into public.sale_items
      (sale_id, product_id, variant_id, unit_id, qty, unit_price, unit_cost, discount, total)
    values
      (v_sale, v_prod.id, nullif(it ->> 'variant_id','')::uuid, nullif(it ->> 'unit_id','')::uuid,
       (it ->> 'qty')::numeric, (it ->> 'unit_price')::numeric, v_cost,
       coalesce((it ->> 'discount')::numeric, 0), v_item_total);
  end loop;

  -- Pagamentos + caixa
  for pay in select * from jsonb_array_elements(p -> 'payments') loop
    insert into public.sale_payments
      (sale_id, method_id, kind, amount, installments, fee_percent, net_amount, change_given)
    values
      (v_sale,
       nullif(pay ->> 'method_id','')::uuid,
       (pay ->> 'kind')::public.payment_kind,
       (pay ->> 'amount')::numeric,
       coalesce((pay ->> 'installments')::int, 1),
       coalesce((pay ->> 'fee_percent')::numeric, 0),
       (pay ->> 'amount')::numeric * (1 - coalesce((pay ->> 'fee_percent')::numeric, 0) / 100),
       coalesce((pay ->> 'change_given')::numeric, 0));

    if (pay ->> 'kind') = 'cash' then
      v_cash_in := v_cash_in + (pay ->> 'amount')::numeric
                   - coalesce((pay ->> 'change_given')::numeric, 0);
    end if;
  end loop;

  if v_cash_in > 0 then
    insert into public.cash_movements (session_id, store_id, type, amount, ref_id, user_id)
    values (v_session, v_store, 'sale', v_cash_in, v_sale, auth.uid());
  end if;

  return jsonb_build_object('sale_id', v_sale, 'number', v_number, 'total', v_total);
end;
$$;
grant execute on function public.complete_sale(jsonb) to authenticated;

-- ---------- Valores esperados do caixa (para o fechamento cego) ----------
create or replace function public.cash_expected(p_session uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with s as (
    select * from public.cash_sessions where id = p_session
  ),
  pays as (
    select sp.kind::text as kind,
           sum(sp.amount - coalesce(sp.change_given, 0)) as total
    from public.sales sa
    join public.sale_payments sp on sp.sale_id = sa.id
    where sa.cash_session_id = p_session and sa.status = 'completed'
    group by sp.kind
  ),
  moves as (
    select coalesce(sum(case when type = 'supply' then amount
                             when type = 'withdrawal' then -amount
                             else 0 end), 0) as net_cash
    from public.cash_movements where session_id = p_session
  )
  select jsonb_build_object(
    'cash', coalesce((select total from pays where kind = 'cash'), 0)
            + (select opening_amount from s)
            + (select net_cash from moves),
    'others', coalesce((select jsonb_object_agg(kind, total) from pays where kind <> 'cash'), '{}'::jsonb)
  )
$$;
grant execute on function public.cash_expected(uuid) to authenticated;

-- ---------- Fechamento cego ----------
create or replace function public.cash_close(
  p_session uuid,
  p_counted jsonb,             -- {"cash": 123.45, ...} contado pelo operador
  p_justification text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected jsonb;
  v_diff numeric;
begin
  perform 1 from public.cash_sessions where id = p_session and status = 'open';
  if not found then
    raise exception 'Caixa não está aberto';
  end if;

  v_expected := public.cash_expected(p_session);
  v_diff := coalesce((p_counted ->> 'cash')::numeric, 0)
            - (v_expected ->> 'cash')::numeric;

  update public.cash_sessions
     set status = 'closed',
         expected = v_expected,
         counted = p_counted,
         difference = v_diff,
         justification = p_justification,
         closed_at = now(),
         closed_by = auth.uid()
   where id = p_session;

  return jsonb_build_object('expected', v_expected, 'difference', v_diff);
end;
$$;
grant execute on function public.cash_close(uuid, jsonb, text) to authenticated;
