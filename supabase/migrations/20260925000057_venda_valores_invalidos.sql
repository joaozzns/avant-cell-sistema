-- A venda aceitava números que não existem no balcão
--
-- Sondagem de 25/09/2026, cinco tentativas, cinco aceitas:
--
--   1. quantidade -2 com preço -100: os sinais se anulam, o total dá R$ 200
--      positivo e o estoque **sobe** 2 unidades numa venda. Era o caminho para
--      inventar mercadoria sem entrada, nota ou fornecedor.
--   2. pagamento em dinheiro de R$ 1.000 com um pix de -R$ 900 numa venda de
--      R$ 100: a soma fecha, mas entram R$ 1.000 na gaveta. O caixa passa a
--      poder receber qualquer valor, desligado do que foi vendido.
--   3. troco de R$ 50 num pagamento em pix: o dinheiro sai da gaveta e nenhum
--      movimento de caixa registra a saída — sobra de R$ 50 no fechamento,
--      exatamente do tamanho de um desvio.
--   4. desconto negativo: acréscimo disfarçado de desconto, que depois aparece
--      como desconto negativo em todo relatório.
--   5. item com quantidade zero: venda de R$ 0 que não move nada.
--
-- Nada disso é possível pela tela; tudo isso era possível chamando a função
-- direto, que é o que um usuário com o token da própria sessão consegue fazer.

create or replace function public.complete_sale(p jsonb)
returns jsonb
language plpgsql
set search_path to ''
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
  v_saldo    numeric;
  v_nome     text;
  v_taxa     numeric;
  v_dias     int;
  v_parcelas int;
  v_qtd      numeric;
  v_preco    numeric;
  v_desc_it  numeric;
  v_valor    numeric;
  v_troco    numeric;
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

  if v_discount < 0 then
    raise exception 'Desconto não pode ser negativo (para cobrar a mais, ajuste o preço do item)';
  end if;

  -- Valida itens e calcula subtotal
  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_qtd     := (it ->> 'qty')::numeric;
    v_preco   := (it ->> 'unit_price')::numeric;
    v_desc_it := coalesce((it ->> 'discount')::numeric, 0);

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

    /* quantidade e preço negativos se anulavam e ainda faziam o estoque subir:
       cada número da venda tem que fazer sentido sozinho */
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Quantidade inválida em %: a venda sai por quantidade maior que zero', v_prod.name;
    end if;
    if v_preco is null or v_preco < 0 then
      raise exception 'Preço inválido em %', v_prod.name;
    end if;
    if v_desc_it < 0 then
      raise exception 'Desconto negativo em %', v_prod.name;
    end if;

    v_item_total := v_qtd * v_preco - v_desc_it;
    if v_item_total < 0 then
      raise exception 'Desconto maior que o valor do item: %', v_prod.name;
    end if;

    -- Preço mínimo: só vende abaixo com permissão
    if v_preco < v_prod.min_price
       and not app.has_permission('sales.below_min_price', v_store) then
      raise exception 'Preço abaixo do mínimo para %: exige autorização de gerente', v_prod.name;
    end if;

    v_subtotal := v_subtotal + v_item_total;
  end loop;

  v_total := v_subtotal - v_discount;
  if v_total < 0 then
    raise exception 'Desconto maior que o total da venda';
  end if;

  -- Pagamentos precisam fechar com o total, e cada um precisa ser um pagamento
  for pay in select * from jsonb_array_elements(p -> 'payments') loop
    v_valor := (pay ->> 'amount')::numeric;
    v_troco := coalesce((pay ->> 'change_given')::numeric, 0);

    if v_valor is null or v_valor <= 0 then
      raise exception 'Valor de pagamento inválido: todo pagamento entra com valor maior que zero';
    end if;
    if v_troco < 0 then
      raise exception 'Troco não pode ser negativo';
    end if;
    /* troco é dinheiro saindo da gaveta: em pix ou cartão ele saía sem
       nenhum movimento de caixa, e a sobra escondia a falta */
    if v_troco > 0 and (pay ->> 'kind') <> 'cash' then
      raise exception 'Só há troco em pagamento em dinheiro';
    end if;
    if v_troco > v_valor then
      raise exception 'Troco maior que o valor recebido';
    end if;

    v_paid := v_paid + v_valor - v_troco;
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
    v_qtd  := (it ->> 'qty')::numeric;
    v_item_total := v_qtd * (it ->> 'unit_price')::numeric
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
      if v_qtd <> 1 then
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
      -- não se vende o que não está na prateleira: o que está reservado é de
      -- outro cliente, e saldo negativo faz o estoque inteiro virar ficção
      select coalesce(qty, 0) - coalesce(reserved, 0) into v_saldo
        from public.stock_items
       where store_id = v_store and product_id = v_prod.id
         and variant_id is not distinct from nullif(it ->> 'variant_id','')::uuid
         for update;

      if coalesce(v_saldo, 0) < v_qtd then
        select name into v_nome from public.products where id = v_prod.id;
        raise exception 'Estoque insuficiente de %: % disponível(is) para vender %',
          v_nome, trim(to_char(coalesce(v_saldo, 0), 'FM999990.###')),
          trim(to_char(v_qtd, 'FM999990.###'));
      end if;

      insert into public.stock_items (store_id, product_id, variant_id, qty)
      values (v_store, v_prod.id, nullif(it ->> 'variant_id','')::uuid, -v_qtd)
      on conflict (store_id, product_id, variant_id) do update
        set qty = public.stock_items.qty - v_qtd;
      insert into public.stock_movements
        (company_id, store_id, product_id, variant_id, type, qty, unit_cost, ref_table, ref_id, user_id)
      values
        (v_company, v_store, v_prod.id, nullif(it ->> 'variant_id','')::uuid,
         'sale_out', -v_qtd, v_cost, 'sales', v_sale, auth.uid());
    end if;

    insert into public.sale_items
      (sale_id, product_id, variant_id, unit_id, qty, unit_price, unit_cost, discount, total)
    values
      (v_sale, v_prod.id, nullif(it ->> 'variant_id','')::uuid, nullif(it ->> 'unit_id','')::uuid,
       v_qtd, (it ->> 'unit_price')::numeric, v_cost,
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
