-- Taxa de cartão: a loja cadastra o que combinou com a maquininha.
--
-- A conciliação já compara a taxa cobrada no extrato com a taxa combinada — só
-- que a combinada nunca existiu: as formas de pagamento estão todas com 0,00 e
-- não havia tela para preencher. Resultado: a tela que existe para pegar
-- maquininha cobrando a mais nunca acusou nada.
--
-- Aqui a venda passa a gravar a taxa vigente no momento em que foi feita. Isso
-- importa: quando a loja renegociar a taxa em março, a venda de janeiro
-- continua sendo conferida contra a taxa de janeiro. E, com o prazo de
-- recebimento cadastrado, o sistema já sabe quanto entra e em que dia.
--
-- Nada disso depende de integração com a adquirente: a taxa combinada vem do
-- contrato, e a taxa cobrada vem do extrato que a loja já importa.

-- ---------- taxa e prazo de uma forma de pagamento ----------
create or replace function app.taxa_do_pagamento(
  p_company   uuid,
  p_kind      public.payment_kind,
  p_parcelas  int default 1,
  p_metodo    uuid default null
)
returns table (taxa numeric, dias int, metodo uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
declare
  v_m record;
  v_faixa jsonb;
begin
  if p_metodo is not null then
    select * into v_m from public.payment_methods
     where id = p_metodo and company_id = p_company;
  end if;
  if v_m is null then
    select * into v_m from public.payment_methods
     where company_id = p_company and kind = p_kind and active
     order by name limit 1;
  end if;
  if v_m is null then
    return query select 0::numeric, 0, null::uuid;
    return;
  end if;

  -- parcelado tem taxa por faixa: 2x, 3x… cada uma com a sua
  if p_parcelas > 1 then
    select e into v_faixa
      from jsonb_array_elements(coalesce(v_m.installments, '[]'::jsonb)) e
     where (e ->> 'n')::int = p_parcelas
     limit 1;
  end if;

  return query select
    coalesce(nullif((v_faixa ->> 'fee_percent')::numeric, 0), v_m.fee_percent, 0),
    coalesce((v_faixa ->> 'days')::int, v_m.days_to_receive, 0),
    v_m.id;
end;
$fn$;

revoke all on function app.taxa_do_pagamento(uuid, public.payment_kind, int, uuid) from public, anon;
grant execute on function app.taxa_do_pagamento(uuid, public.payment_kind, int, uuid) to authenticated;

-- ---------- a venda grava a taxa combinada ----------
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
  v_metodo   uuid;
  v_taxa     numeric;
  v_dias     int;
  v_parcelas int;
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
    v_parcelas := greatest(coalesce((pay ->> 'installments')::int, 1), 1);
    v_metodo   := nullif(pay ->> 'method_id', '')::uuid;

    -- taxa combinada com a maquininha, congelada no momento da venda:
    -- renegociar a taxa amanhã não pode mudar o que foi vendido ontem
    select f.taxa, f.dias, coalesce(v_metodo, f.metodo)
      into v_taxa, v_dias, v_metodo
      from app.taxa_do_pagamento(v_company, (pay ->> 'kind')::public.payment_kind,
                                 v_parcelas, v_metodo) f;

    v_taxa := coalesce(nullif((pay ->> 'fee_percent')::numeric, 0), v_taxa, 0);
    v_dias := coalesce(v_dias, 0);

    insert into public.sale_payments
      (sale_id, method_id, kind, amount, installments, fee_percent, net_amount,
       expected_date, change_given)
    values
      (v_sale,
       v_metodo,
       (pay ->> 'kind')::public.payment_kind,
       (pay ->> 'amount')::numeric,
       v_parcelas,
       v_taxa,
       round((pay ->> 'amount')::numeric * (1 - v_taxa / 100), 2),
       current_date + v_dias,
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

revoke all on function public.complete_sale(jsonb) from public, anon;
grant execute on function public.complete_sale(jsonb) to authenticated;
