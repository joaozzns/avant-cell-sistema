-- Caixa não pode ficar negativo.
--
-- No teste da compra de usado, a loja pagou R$ 900 em dinheiro com R$ 339,50
-- na gaveta e o caixa foi para -R$ 560,50. Na prática isso não existe: ou o
-- dinheiro está lá, ou o operador precisa fazer um suprimento antes.
--
-- Vale para as duas saídas de dinheiro que criamos: devolução ao cliente e
-- compra de aparelho usado.

create or replace function app.cash_disponivel(p_session uuid)
returns numeric
language sql
security invoker
set search_path = ''
as $$
  select coalesce((public.cash_expected(p_session) ->> 'cash')::numeric, 0)
$$;

revoke all on function app.cash_disponivel(uuid) from public, anon;
grant execute on function app.cash_disponivel(uuid) to authenticated;

-- ---------- devolução em dinheiro ----------
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
  v_caixa    numeric;
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
    v_caixa := app.cash_disponivel(v_session);
    if v_total > v_caixa then
      raise exception 'O caixa tem R$ % e a devolução é de R$ %. Faça um suprimento ou devolva de outra forma.', v_caixa, v_total;
    end if;
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

-- ---------- compra de usado em dinheiro ----------
create or replace function public.register_trade_in(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store    uuid := (p ->> 'store_id')::uuid;
  v_company  uuid;
  v_prod     record;
  v_imei     text := nullif(trim(p ->> 'imei'), '');
  v_valor    numeric := coalesce((p ->> 'paid_amount')::numeric, 0);
  v_forma    public.payment_kind := coalesce(nullif(p ->> 'payment_kind', ''), 'cash')::public.payment_kind;
  v_session  uuid := nullif(p ->> 'cash_session_id', '')::uuid;
  v_cliente  uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_doc      text := nullif(trim(p ->> 'doc_photo_url'), '');
  v_caixa    numeric;
  v_trade    uuid;
  v_unit     uuid;
  v_credito  uuid;
begin
  select company_id into v_company from public.stores where id = v_store;
  if v_company is null then
    raise exception 'Loja não encontrada';
  end if;
  if not app.has_permission('stock.entry', v_store) then
    raise exception 'Você não tem permissão para dar entrada em estoque';
  end if;

  if coalesce(trim(p ->> 'seller_name'), '') = '' or coalesce(trim(p ->> 'seller_cpf'), '') = '' then
    raise exception 'Informe nome e CPF de quem está vendendo o aparelho';
  end if;
  if v_doc is null then
    raise exception 'A foto do documento do vendedor é obrigatória';
  end if;
  if split_part(v_doc, '/', 1) <> v_company::text then
    raise exception 'Arquivo de documento inválido';
  end if;
  if v_imei is null or not app.imei_is_valid(v_imei) then
    raise exception 'IMEI inválido';
  end if;
  if v_valor <= 0 then
    raise exception 'Informe o valor pago pelo aparelho';
  end if;
  if v_forma = 'store_credit' and v_cliente is null then
    raise exception 'Crédito na loja exige cliente cadastrado';
  end if;

  perform 1 from public.serialized_units
   where company_id = v_company and imei1 = v_imei;
  if found then
    raise exception 'Já existe um aparelho com este IMEI no estoque';
  end if;

  select id, serialized, active into v_prod
    from public.products
   where id = (p ->> 'product_id')::uuid and company_id = v_company;
  if not found then
    raise exception 'Produto (modelo) inválido';
  end if;
  if not v_prod.serialized then
    raise exception 'O modelo escolhido não é controlado por IMEI';
  end if;

  if v_forma = 'cash' then
    perform 1 from public.cash_sessions
     where id = v_session and store_id = v_store and status = 'open';
    if not found then
      raise exception 'Abra o caixa para pagar o aparelho em dinheiro';
    end if;
    v_caixa := app.cash_disponivel(v_session);
    if v_valor > v_caixa then
      raise exception 'O caixa tem R$ % e a compra é de R$ %. Faça um suprimento ou pague de outra forma.', v_caixa, v_valor;
    end if;
  end if;

  insert into public.trade_ins
    (company_id, store_id, customer_id, seller_name, seller_cpf, seller_rg, doc_photo_url,
     brand, model, imei, color, capacity, condition, accessories, checklist,
     device_photos, paid_amount, payment_kind, suggested_price, created_by)
  values
    (v_company, v_store, v_cliente,
     trim(p ->> 'seller_name'), regexp_replace(p ->> 'seller_cpf', '\D', '', 'g'),
     nullif(trim(p ->> 'seller_rg'), ''), v_doc,
     coalesce(nullif(trim(p ->> 'brand'), ''), '—'),
     coalesce(nullif(trim(p ->> 'model'), ''), '—'),
     v_imei, nullif(trim(p ->> 'color'), ''), nullif(trim(p ->> 'capacity'), ''),
     coalesce(nullif(p ->> 'condition', ''), 'used')::public.item_condition,
     coalesce(p -> 'accessories', '[]'::jsonb),
     coalesce(p -> 'checklist', '{}'::jsonb),
     coalesce(p -> 'device_photos', '[]'::jsonb),
     v_valor, v_forma,
     nullif(p ->> 'suggested_price', '')::numeric,
     auth.uid())
  returning id into v_trade;

  insert into public.serialized_units
    (company_id, store_id, product_id, imei1, color, capacity, condition, status,
     origin, origin_id, cost, sale_price, notes)
  values
    (v_company, v_store, v_prod.id, v_imei,
     nullif(trim(p ->> 'color'), ''), nullif(trim(p ->> 'capacity'), ''),
     coalesce(nullif(p ->> 'condition', ''), 'used')::public.item_condition,
     'available', 'trade_in', v_trade, v_valor,
     nullif(p ->> 'suggested_price', '')::numeric,
     'Entrada em troca de ' || trim(p ->> 'seller_name'))
  returning id into v_unit;

  update public.trade_ins set unit_id = v_unit where id = v_trade;

  insert into public.stock_movements
    (company_id, store_id, product_id, unit_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
  values
    (v_company, v_store, v_prod.id, v_unit, 'trade_in', 1, v_valor, 'trade_ins', v_trade,
     'Compra de aparelho usado', auth.uid());

  if v_forma = 'cash' then
    insert into public.cash_movements
      (session_id, store_id, type, amount, reason, destination, ref_id, user_id)
    values
      (v_session, v_store, 'withdrawal', v_valor,
       'Compra de aparelho usado (IMEI ' || v_imei || ')', 'despesa', v_trade, auth.uid());
  elsif v_forma = 'store_credit' then
    v_credito := app.credit_add(v_company, v_store, v_cliente, v_valor, 'trade_in', v_trade);
  end if;

  return jsonb_build_object('trade_in_id', v_trade, 'unit_id', v_unit, 'credit_id', v_credito);
end;
$$;
