-- Troca/devolução de venda e crédito na loja.
--
-- 1. store_credits deixa de aceitar escrita direta: crédito só nasce de uma
--    devolução e só é gasto numa venda, pelas funções abaixo.
-- 2. return_sale: devolve itens (total ou parcial), repõe estoque ou manda
--    para avaria, e reembolsa em dinheiro (sai do caixa), estorno ou crédito.
-- 3. complete_sale aceita "crédito na loja" como forma de pagamento.
-- 4. cash_expected passa a contar vendas devolvidas (o dinheiro entrou) e a
--    descontar os reembolsos em dinheiro.

-- ---------- 1. crédito na loja protegido ----------
drop policy if exists tenant_all on public.store_credits;
create policy store_credits_select on public.store_credits
  for select to authenticated
  using (company_id = app.current_company_id());

create or replace function app.credit_add(
  p_company uuid, p_store uuid, p_customer uuid, p_amount numeric, p_origin text, p_origin_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_company is distinct from app.current_company_id() then
    raise exception 'Empresa inválida';
  end if;
  if p_amount <= 0 then
    raise exception 'Valor de crédito inválido';
  end if;
  insert into public.store_credits (company_id, store_id, customer_id, amount, balance, origin, origin_id)
  values (p_company, p_store, p_customer, p_amount, p_amount, p_origin, p_origin_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.credit_consume(p_company uuid, p_customer uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_saldo numeric;
  v_falta numeric := p_amount;
  v_uso   numeric;
  c       record;
begin
  if p_company is distinct from app.current_company_id() then
    raise exception 'Empresa inválida';
  end if;

  select coalesce(sum(balance), 0) into v_saldo
    from public.store_credits
   where company_id = p_company and customer_id = p_customer and balance > 0
     and (expires_at is null or expires_at >= current_date);
  if v_saldo < p_amount then
    raise exception 'Crédito na loja insuficiente: saldo de R$ % para pagar R$ %', v_saldo, p_amount;
  end if;

  for c in
    select id, balance from public.store_credits
     where company_id = p_company and customer_id = p_customer and balance > 0
       and (expires_at is null or expires_at >= current_date)
     order by created_at
     for update
  loop
    exit when v_falta <= 0;
    v_uso := least(c.balance, v_falta);
    update public.store_credits set balance = balance - v_uso where id = c.id;
    v_falta := v_falta - v_uso;
  end loop;
end;
$$;

revoke all on function app.credit_add(uuid, uuid, uuid, numeric, text, uuid) from public, anon;
revoke all on function app.credit_consume(uuid, uuid, numeric) from public, anon;
grant execute on function app.credit_add(uuid, uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function app.credit_consume(uuid, uuid, numeric) to authenticated;

-- ---------- 2. devolução ----------
create or replace function public.return_sale(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sale     record;
  v_item     record;
  v_ret      uuid;
  v_credit   uuid;
  v_total    numeric := 0;
  v_qty      numeric;
  v_val      numeric;
  v_restante numeric;
  v_track    boolean;
  v_dest     public.return_destination;
  v_kind     public.payment_kind := (p ->> 'refund_kind')::public.payment_kind;
  v_session  uuid := nullif(p ->> 'cash_session_id', '')::uuid;
  it         jsonb;
begin
  select id, company_id, store_id, status, customer_id into v_sale
    from public.sales where id = (p ->> 'sale_id')::uuid
     for update;
  if not found then
    raise exception 'Venda não encontrada';
  end if;
  if v_sale.status not in ('completed', 'partially_returned') then
    raise exception 'Esta venda não pode ser devolvida (situação: %)', v_sale.status;
  end if;
  if not app.has_permission('sales.return', v_sale.store_id) then
    raise exception 'Você não tem permissão para fazer devolução ou troca';
  end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Selecione ao menos um item para devolver';
  end if;
  if v_kind = 'store_credit' and v_sale.customer_id is null then
    raise exception 'Crédito na loja exige cliente identificado na venda original';
  end if;
  if v_kind = 'cash' then
    perform 1 from public.cash_sessions
     where id = v_session and store_id = v_sale.store_id and status = 'open';
    if not found then
      raise exception 'Abra o caixa para devolver o dinheiro';
    end if;
  end if;

  insert into public.sale_returns
    (company_id, store_id, sale_id, reason, refund_kind, total, notes, created_by)
  values
    (v_sale.company_id, v_sale.store_id, v_sale.id,
     (p ->> 'reason')::public.return_reason, v_kind, 0,
     nullif(p ->> 'notes', ''), auth.uid())
  returning id into v_ret;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty  := (it ->> 'qty')::numeric;
    v_dest := coalesce(nullif(it ->> 'destination', ''), 'stock')::public.return_destination;

    select si.id, si.product_id, si.variant_id, si.unit_id, si.qty,
           coalesce(si.returned_qty, 0) as returned_qty, si.total, si.unit_cost
      into v_item
      from public.sale_items si
     where si.id = (it ->> 'sale_item_id')::uuid and si.sale_id = v_sale.id
       for update;
    if not found then
      raise exception 'Item não pertence a esta venda';
    end if;
    if v_qty <= 0 or v_qty > v_item.qty - v_item.returned_qty then
      raise exception 'Quantidade a devolver inválida (restam % deste item)', v_item.qty - v_item.returned_qty;
    end if;

    v_val   := round(v_item.total / v_item.qty * v_qty, 2);
    v_total := v_total + v_val;

    update public.sale_items set returned_qty = coalesce(returned_qty, 0) + v_qty where id = v_item.id;
    insert into public.sale_return_items (return_id, sale_item_id, qty, destination)
    values (v_ret, v_item.id, v_qty, v_dest);

    if v_item.unit_id is not null then
      -- aparelho com IMEI: volta para venda ou fica separado, conforme o destino
      update public.serialized_units
         set status = (case v_dest
                         when 'stock'  then 'available'
                         when 'damage' then 'damaged'
                         when 'os'     then 'in_service'
                         else 'returned' end)::public.unit_status,
             updated_at = now()
       where id = v_item.unit_id;
      insert into public.stock_movements
        (company_id, store_id, product_id, variant_id, unit_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
      values
        (v_sale.company_id, v_sale.store_id, v_item.product_id, v_item.variant_id, v_item.unit_id,
         'sale_return_in', 1, v_item.unit_cost, 'sale_returns', v_ret, v_dest::text, auth.uid());
    else
      select track_stock into v_track from public.products where id = v_item.product_id;
      if v_track then
        insert into public.stock_movements
          (company_id, store_id, product_id, variant_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
        values
          (v_sale.company_id, v_sale.store_id, v_item.product_id, v_item.variant_id,
           'sale_return_in', v_qty, v_item.unit_cost, 'sale_returns', v_ret, v_dest::text, auth.uid());
        if v_dest = 'stock' then
          insert into public.stock_items (store_id, product_id, variant_id, qty)
          values (v_sale.store_id, v_item.product_id, v_item.variant_id, v_qty)
          on conflict (store_id, product_id, variant_id) do update
            set qty = public.stock_items.qty + v_qty;
        else
          -- não volta para venda: entra e sai como avaria, para o histórico fechar
          insert into public.stock_movements
            (company_id, store_id, product_id, variant_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
          values
            (v_sale.company_id, v_sale.store_id, v_item.product_id, v_item.variant_id,
             'breakage', -v_qty, v_item.unit_cost, 'sale_returns', v_ret, v_dest::text, auth.uid());
        end if;
      end if;
    end if;
  end loop;

  update public.sale_returns set total = v_total where id = v_ret;

  if v_kind = 'store_credit' then
    v_credit := app.credit_add(v_sale.company_id, v_sale.store_id, v_sale.customer_id, v_total, 'return', v_ret);
  elsif v_kind = 'cash' then
    insert into public.cash_movements (session_id, store_id, type, amount, ref_id, user_id)
    values (v_session, v_sale.store_id, 'refund', v_total, v_ret, auth.uid());
  end if;

  select coalesce(sum(qty - coalesce(returned_qty, 0)), 0) into v_restante
    from public.sale_items where sale_id = v_sale.id;
  update public.sales
     set status = (case when v_restante <= 0 then 'returned' else 'partially_returned' end)::public.sale_status
   where id = v_sale.id;

  return jsonb_build_object('return_id', v_ret, 'total', v_total, 'credit_id', v_credit);
end;
$$;

revoke all on function public.return_sale(jsonb) from public, anon;
grant execute on function public.return_sale(jsonb) to authenticated;

-- ---------- 3. crédito na loja no PDV ----------
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
  v_credito  numeric := 0;
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

    if (pay ->> 'kind') = 'store_credit' then
      if nullif(p ->> 'customer_id', '') is null then
        raise exception 'Crédito na loja exige cliente vinculado à venda';
      end if;
      v_credito := v_credito + (pay ->> 'amount')::numeric;
    end if;

    if (pay ->> 'kind') = 'cash' then
      v_cash_in := v_cash_in + (pay ->> 'amount')::numeric
                   - coalesce((pay ->> 'change_given')::numeric, 0);
    end if;
  end loop;

  if v_cash_in > 0 then
    insert into public.cash_movements (session_id, store_id, type, amount, ref_id, user_id)
    values (v_session, v_store, 'sale', v_cash_in, v_sale, auth.uid());
  end if;

  -- Crédito na loja: abate do saldo do cliente (mais antigo primeiro)
  if v_credito > 0 then
    perform app.credit_consume(v_company, (p ->> 'customer_id')::uuid, v_credito);
  end if;

  return jsonb_build_object('sale_id', v_sale, 'number', v_number, 'total', v_total);
end;
$$;

-- ---------- 4. caixa esperado ----------
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
    where sa.cash_session_id = p_session
      and sa.status in ('completed', 'partially_returned', 'returned')
    group by sp.kind
  ),
  moves as (
    select coalesce(sum(case when type = 'supply' then amount
                             when type = 'withdrawal' then -amount
                             when type = 'refund' then -amount
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
