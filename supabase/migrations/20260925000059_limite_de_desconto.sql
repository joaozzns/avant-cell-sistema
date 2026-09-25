-- O limite de desconto só existia na tela de permissões
--
-- `app.permission_limit` esta no banco desde a primeira migracao e nunca foi
-- chamada por ninguém. O seed configura 30% para o gerente e 5% para o
-- vendedor; na prática os dois davam 100%, porque nada lia esse numero.
--
-- Aqui o limite passa a valer na venda. A baixa de conta a receber ganha a
-- mesma disciplina: juros e desconto negativos eram aceitos, e dar desconto
-- numa parcela — que é perdoar dívida — não pedia permissão nenhuma, então
-- qualquer usuário podia zerar o que um cliente devia declarando um desconto
-- do tamanho da parcela.

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
  v_desc_itens numeric := 0;
  v_bruto    numeric;
  v_limite   numeric;
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

    v_desc_itens := v_desc_itens + v_desc_it;
    v_subtotal := v_subtotal + v_item_total;
  end loop;

  /* "Dar desconto (limite em %)" aparece na tela de permissões desde o
     primeiro dia e nunca foi conferido: qualquer pessoa dava qualquer
     desconto. O limite é sobre o valor cheio da venda, somando o desconto
     dos itens com o desconto do total. */
  if v_desc_itens + v_discount > 0 then
    if not app.has_permission('sales.discount', v_store) then
      raise exception 'Você não tem permissão para dar desconto';
    end if;
    v_limite := app.permission_limit('sales.discount', v_store);
    v_bruto  := v_subtotal + v_desc_itens;
    if v_limite is not null and not app.is_admin()
       and v_bruto > 0
       and (v_desc_itens + v_discount) > round(v_bruto * v_limite / 100, 2) then
      raise exception 'Desconto de % em uma venda de %: seu limite é de % por cento',
        app.brl(v_desc_itens + v_discount), app.brl(v_bruto),
        trim(to_char(v_limite, 'FM999990.##'));
    end if;
  end if;

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

create or replace function public.settle_receivable(
  p_id uuid, p_amount numeric, p_interest numeric default 0,
  p_discount numeric default 0, p_account uuid default null)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare v_r record; v_session uuid; v_due numeric; v_limite numeric; v_base numeric;
begin
  select * into v_r from public.receivables where id = p_id for update;
  if not found then raise exception 'Conta a receber não encontrada'; end if;
  if v_r.status not in ('open','partial') then
    raise exception 'Esta conta não está em aberto (status: %)', v_r.status;
  end if;

  if not app.has_permission('finance.receivables', v_r.store_id) then
    raise exception 'Você não tem permissão para baixar contas a receber';
  end if;

  if p_amount <= 0 then raise exception 'Valor inválido'; end if;
  if coalesce(p_interest, 0) < 0 then
    raise exception 'Juros não podem ser negativos';
  end if;
  if coalesce(p_discount, 0) < 0 then
    raise exception 'Desconto não pode ser negativo';
  end if;

  /* desconto numa parcela é perdoar dívida: mesma permissão e mesmo limite
     do desconto de venda, medido sobre o que o cliente devia */
  if coalesce(p_discount, 0) > 0 then
    if not app.has_permission('sales.discount', v_r.store_id) then
      raise exception 'Você não tem permissão para dar desconto na parcela';
    end if;
    v_limite := app.permission_limit('sales.discount', v_r.store_id);
    v_base   := v_r.amount + v_r.interest + coalesce(p_interest, 0) + v_r.fine - v_r.discount;
    if v_limite is not null and not app.is_admin()
       and v_base > 0
       and p_discount > round(v_base * v_limite / 100, 2) then
      raise exception 'Desconto de % em uma parcela de %: seu limite é de % por cento',
        app.brl(p_discount), app.brl(v_base), trim(to_char(v_limite, 'FM999990.##'));
    end if;
  end if;

  v_due := v_r.amount + v_r.interest + p_interest + v_r.fine
           - v_r.discount - p_discount - v_r.paid_amount;
  if round(p_amount, 2) > round(v_due, 2) then
    raise exception 'Valor maior que o saldo da parcela (%)', v_due;
  end if;

  if p_account is null then
    select id into v_session from public.cash_sessions
     where store_id = v_r.store_id and opened_by = auth.uid() and status = 'open';
    if v_session is null then
      raise exception 'Abra o caixa ou informe a conta de destino';
    end if;
    insert into public.cash_movements (session_id, store_id, type, amount, reason, ref_id, user_id)
    values (v_session, v_r.store_id, 'receivable_payment', p_amount,
            'Recebimento: ' || v_r.description, v_r.id, auth.uid());
  else
    insert into public.transactions
      (company_id, account_id, store_id, kind, amount, category_id, ref_table, ref_id, description, created_by)
    values
      (v_r.company_id, p_account, v_r.store_id, 'in', p_amount, v_r.category_id,
       'receivables', v_r.id, 'Recebimento: ' || v_r.description, auth.uid());
  end if;

  update public.receivables
     set paid_amount = paid_amount + p_amount,
         interest = interest + p_interest,
         discount = discount + p_discount,
         account_id = coalesce(p_account, account_id),
         cash_session_id = coalesce(v_session, cash_session_id),
         paid_at = case when round(paid_amount + p_amount, 2) >= round(amount + interest + p_interest + fine - discount - p_discount, 2)
                        then now() else paid_at end,
         status = case when round(paid_amount + p_amount, 2) >= round(amount + interest + p_interest + fine - discount - p_discount, 2)
                       then 'paid'::public.bill_status else 'partial'::public.bill_status end
   where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.settle_payable(p_id uuid, p_amount numeric, p_account uuid)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare v_p record; v_limite numeric;
begin
  select * into v_p from public.payables where id = p_id for update;
  if not found then raise exception 'Conta a pagar não encontrada'; end if;
  if v_p.status not in ('open','partial') then
    raise exception 'Esta conta não está em aberto (status: %)', v_p.status;
  end if;

  if not app.has_permission('finance.payables', v_p.store_id) then
    raise exception 'Você não tem permissão para pagar contas';
  end if;

  if p_amount <= 0 or round(p_amount, 2) > round(v_p.amount - v_p.paid_amount, 2) then
    raise exception 'Valor inválido (saldo: %)', v_p.amount - v_p.paid_amount;
  end if;

  -- "Aprovar pagamento (limite em R$)": quem tem alçada definida respeita a alçada
  v_limite := app.permission_limit('finance.payables_approve', v_p.store_id);
  if v_limite is not null and not app.is_admin() and p_amount > v_limite then
    raise exception 'Pagamento de %, acima da sua alçada de %',
      app.brl(p_amount), app.brl(v_limite);
  end if;

  insert into public.transactions
    (company_id, account_id, store_id, kind, amount, category_id, cost_center_id,
     ref_table, ref_id, description, created_by)
  values
    (v_p.company_id, p_account, v_p.store_id, 'out', p_amount, v_p.category_id,
     v_p.cost_center_id, 'payables', v_p.id, 'Pagamento: ' || v_p.description, auth.uid());

  update public.payables
     set paid_amount = paid_amount + p_amount,
         account_id = p_account,
         paid_at = case when round(paid_amount + p_amount, 2) >= round(amount, 2) then now() else paid_at end,
         status = case when round(paid_amount + p_amount, 2) >= round(amount, 2)
                       then 'paid'::public.bill_status else 'partial'::public.bill_status end
   where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
