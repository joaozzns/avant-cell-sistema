-- Reserva e encomenda de produto.
--
-- O cliente deixa um sinal e o aparelho sai da vitrine para o nome dele. Se o
-- modelo não tem em estoque, vira encomenda e acompanha a chegada. Se o cliente
-- some, a reserva vence, o aparelho volta para a venda e o sinal fica onde
-- deve: como crédito do cliente — dinheiro do cliente só deixa de ser dele por
-- decisão registrada de quem tem permissão, nunca por esquecimento.
--
-- O sinal entra como crédito na loja (store_credits, origem 'deposit'), então
-- o PDV já sabe abater na hora da venda, e o dinheiro em espécie entra no caixa
-- aberto como qualquer outra entrada.

-- Retém o sinal de UMA reserva. Não usa app.credit_consume de propósito:
-- aquela função gasta o crédito mais antigo do cliente, que pode ser de uma
-- devolução — dinheiro que não tem nada a ver com esta reserva.
create or replace function app.credit_forfeit(p_company uuid, p_origin_id uuid)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric := 0;
begin
  if p_company is distinct from app.current_company_id() then
    raise exception 'Empresa inválida';
  end if;

  select coalesce(sum(balance), 0) into v_total
    from public.store_credits
   where company_id = p_company and origin = 'deposit' and origin_id = p_origin_id;

  update public.store_credits set balance = 0
   where company_id = p_company and origin = 'deposit' and origin_id = p_origin_id
     and balance > 0;

  return v_total;
end;
$$;

revoke all on function app.credit_forfeit(uuid, uuid) from public, anon;
grant execute on function app.credit_forfeit(uuid, uuid) to authenticated;

create or replace function public.reservation_create(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store    uuid := (p ->> 'store_id')::uuid;
  v_company  uuid;
  v_cliente  uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_prod     uuid := nullif(p ->> 'product_id', '')::uuid;
  v_variante uuid := nullif(p ->> 'variant_id', '')::uuid;
  v_unidade  uuid := nullif(p ->> 'unit_id', '')::uuid;
  v_qtd      numeric := coalesce((p ->> 'qty')::numeric, 1);
  v_sinal    numeric := coalesce((p ->> 'deposit_amount')::numeric, 0);
  v_forma    text := coalesce(p ->> 'deposit_kind', 'cash');
  v_session  uuid := nullif(p ->> 'session_id', '')::uuid;
  v_prazo    date := nullif(p ->> 'pickup_deadline', '')::date;
  v_desc     text := nullif(trim(p ->> 'description'), '');
  v_situacao public.reservation_status := 'awaiting_purchase';
  v_saldo    numeric;
  v_unit     record;
  v_id       uuid;
  v_credito  uuid;
begin
  select company_id into v_company from public.stores where id = v_store;
  if v_company is null then
    raise exception 'Loja não encontrada';
  end if;
  if not app.has_permission('sales.create', v_store) then
    raise exception 'Você não tem permissão para reservar produtos nesta loja';
  end if;
  if v_cliente is null then
    raise exception 'Reserva sem cliente identificado não existe: quem vem buscar depois?';
  end if;
  if v_sinal < 0 then
    raise exception 'Sinal não pode ser negativo';
  end if;
  if v_qtd <= 0 then
    raise exception 'Quantidade inválida';
  end if;
  if v_prod is null and v_unidade is null and v_desc is null then
    raise exception 'Diga o que o cliente está reservando';
  end if;
  if v_prazo is not null and v_prazo < current_date then
    raise exception 'A data de retirada já passou';
  end if;

  -- aparelho com IMEI: sai da vitrine agora, em nome do cliente
  if v_unidade is not null then
    select id, status, store_id, product_id into v_unit
      from public.serialized_units where id = v_unidade for update;
    if not found or v_unit.store_id <> v_store then
      raise exception 'Aparelho não está nesta loja';
    end if;
    if v_unit.status <> 'available' then
      raise exception 'Aparelho indisponível para reservar (situação: %)', v_unit.status;
    end if;
    update public.serialized_units set status = 'reserved', updated_at = now()
     where id = v_unidade;
    v_prod := coalesce(v_prod, v_unit.product_id);
    v_situacao := 'available';

  -- produto comum: segura a quantidade se houver saldo livre
  elsif v_prod is not null then
    select qty - reserved into v_saldo
      from public.stock_items
     where store_id = v_store and product_id = v_prod
       and variant_id is not distinct from v_variante
       for update;

    if coalesce(v_saldo, 0) >= v_qtd then
      update public.stock_items set reserved = reserved + v_qtd
       where store_id = v_store and product_id = v_prod
         and variant_id is not distinct from v_variante;
      v_situacao := 'available';
    end if;
  end if;

  if v_sinal > 0 and v_forma = 'cash' then
    perform 1 from public.cash_sessions
     where id = v_session and store_id = v_store and status = 'open';
    if not found then
      raise exception 'Abra o caixa para receber o sinal em dinheiro';
    end if;
  end if;

  insert into public.reservations
    (company_id, store_id, customer_id, product_id, variant_id, description,
     agreed_price, deposit_amount, deposit_policy, status, unit_id, pickup_deadline, created_by)
  values
    (v_company, v_store, v_cliente, v_prod, v_variante, v_desc,
     nullif(p ->> 'agreed_price', '')::numeric, v_sinal,
     nullif(trim(p ->> 'deposit_policy'), ''), v_situacao, v_unidade, v_prazo, auth.uid())
  returning id into v_id;

  -- o sinal é do cliente: vira crédito na loja e o PDV abate na venda
  if v_sinal > 0 then
    v_credito := app.credit_add(v_company, v_store, v_cliente, v_sinal, 'deposit', v_id);

    if v_forma = 'cash' then
      insert into public.cash_movements
        (session_id, store_id, type, amount, reason, ref_id, user_id)
      values
        (v_session, v_store, 'receivable_payment', v_sinal,
         'Sinal de reserva', v_id, auth.uid());
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'status', v_situacao, 'credit_id', v_credito);
end;
$$;

-- ---------- andamento, entrega, cancelamento ----------
create or replace function public.reservation_update(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_r        record;
  v_novo     public.reservation_status := (p ->> 'status')::public.reservation_status;
  v_unidade  uuid := nullif(p ->> 'unit_id', '')::uuid;
  v_perder   boolean := coalesce((p ->> 'forfeit_deposit')::boolean, false);
  v_unit     record;
  v_saldo    numeric;
  v_perdido  numeric := 0;
begin
  select * into v_r from public.reservations
   where id = (p ->> 'id')::uuid and company_id = app.current_company_id()
   for update;
  if not found then
    raise exception 'Reserva não encontrada';
  end if;
  if not app.has_permission('sales.create', v_r.store_id) then
    raise exception 'Você não tem permissão para mexer nesta reserva';
  end if;
  if v_r.status in ('delivered', 'canceled', 'expired') then
    raise exception 'Esta reserva já foi encerrada (situação: %)', v_r.status;
  end if;
  if v_perder and not app.has_permission('sales.cancel', v_r.store_id) then
    raise exception 'Reter o sinal do cliente exige permissão de cancelamento de venda';
  end if;

  -- o aparelho encomendado chegou: passa a ser o aparelho desta reserva
  if v_unidade is not null and v_unidade is distinct from v_r.unit_id then
    select id, status, store_id into v_unit
      from public.serialized_units where id = v_unidade for update;
    if not found or v_unit.store_id <> v_r.store_id then
      raise exception 'Aparelho não está nesta loja';
    end if;
    if v_unit.status <> 'available' then
      raise exception 'Aparelho indisponível (situação: %)', v_unit.status;
    end if;
    update public.serialized_units set status = 'reserved', updated_at = now()
     where id = v_unidade;
    update public.reservations set unit_id = v_unidade where id = v_r.id;
    v_r.unit_id := v_unidade;
  end if;

  -- encerrou: o que estava segurado volta para a venda
  if v_novo in ('delivered', 'canceled', 'expired') then
    if v_r.unit_id is not null then
      update public.serialized_units
         set status = 'available', updated_at = now()
       where id = v_r.unit_id and status = 'reserved';
    elsif v_r.product_id is not null and v_r.status = 'available' then
      update public.stock_items
         set reserved = greatest(0, reserved - 1)
       where store_id = v_r.store_id and product_id = v_r.product_id
         and variant_id is not distinct from v_r.variant_id;
    end if;
  end if;

  -- sinal retido: decisão consciente, com motivo e registro
  if v_perder and v_novo in ('canceled', 'expired') and v_r.deposit_amount > 0 then
    if coalesce(nullif(trim(p ->> 'reason'), ''), '') = '' then
      raise exception 'Para ficar com o sinal do cliente é preciso dizer por quê';
    end if;

    v_perdido := app.credit_forfeit(v_r.company_id, v_r.id);

    insert into public.audit_logs
      (company_id, store_id, user_id, action, table_name, record_id, after, reason)
    values
      (v_r.company_id, v_r.store_id, auth.uid(), 'update', 'reservations', v_r.id::text,
       jsonb_build_object('sinal_retido', v_perdido, 'cliente', v_r.customer_id),
       trim(p ->> 'reason'));
  end if;

  update public.reservations
     set status = v_novo,
         pickup_deadline = coalesce(nullif(p ->> 'pickup_deadline', '')::date, pickup_deadline),
         agreed_price = coalesce(nullif(p ->> 'agreed_price', '')::numeric, agreed_price),
         sale_id = coalesce(nullif(p ->> 'sale_id', '')::uuid, sale_id),
         notified_at = case when v_novo = 'available' then now() else notified_at end
   where id = v_r.id;

  return jsonb_build_object('ok', true, 'sinal_retido', v_perdido);
end;
$$;

-- ---------- vencimento automático ----------
create or replace function public.reservation_expire_due(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store uuid := nullif(p ->> 'store_id', '')::uuid;
  v_r     record;
  v_qtd   int := 0;
begin
  for v_r in
    select r.* from public.reservations r
     where r.company_id = app.current_company_id()
       and (v_store is null or r.store_id = v_store)
       and r.status in ('awaiting_purchase', 'on_the_way', 'available')
       and r.pickup_deadline is not null
       and r.pickup_deadline < current_date
  loop
    perform public.reservation_update(
      jsonb_build_object('id', v_r.id, 'status', 'expired'));
    v_qtd := v_qtd + 1;
  end loop;

  return jsonb_build_object('vencidas', v_qtd);
end;
$$;

revoke all on function public.reservation_create(jsonb)     from public, anon;
revoke all on function public.reservation_update(jsonb)     from public, anon;
revoke all on function public.reservation_expire_due(jsonb) from public, anon;
grant execute on function public.reservation_create(jsonb)     to authenticated;
grant execute on function public.reservation_update(jsonb)     to authenticated;
grant execute on function public.reservation_expire_due(jsonb) to authenticated;
