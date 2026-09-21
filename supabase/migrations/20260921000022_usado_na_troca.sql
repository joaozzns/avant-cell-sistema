-- Compra de aparelho usado (entrada em troca).
--
-- Registra quem vendeu, com documento fotografado, o estado do aparelho e o
-- valor pago; cria a unidade no estoque com IMEI e origem 'trade_in'; e paga o
-- vendedor de um destes jeitos:
--   dinheiro       -> sai do caixa aberto (sangria com motivo)
--   pix            -> só registra; a transferência é feita fora do sistema
--   crédito na loja -> vira saldo do cliente, que abate a compra do aparelho novo
--
-- A foto do documento é obrigatória: é ela que protege a loja se o aparelho
-- tiver sido furtado.

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

  -- entra no estoque como unidade com IMEI, custo = valor pago
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

  -- pagamento ao vendedor
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

revoke all on function public.register_trade_in(jsonb) from public, anon;
grant execute on function public.register_trade_in(jsonb) to authenticated;
