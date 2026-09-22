-- Reserva de produto controlado por IMEI.
--
-- Aparelho com IMEI não tem saldo em stock_items: o estoque dele é a lista de
-- unidades disponíveis. Pela regra anterior, um Galaxy S23 parado na vitrine
-- entrava como "encomenda" — e pior, a reserva não segurava aparelho nenhum,
-- então o mesmo aparelho podia ser vendido para outra pessoa no mesmo dia.
--
-- Agora: modelo com IMEI e aparelho disponível exige escolher qual aparelho
-- fica guardado. Sem nenhum disponível, aí sim é encomenda.

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
  v_serial   boolean := false;
  v_livres   int := 0;
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

  elsif v_prod is not null then
    select serialized into v_serial from public.products
     where id = v_prod and company_id = v_company;

    if v_serial then
      -- o estoque de um modelo com IMEI é a lista de aparelhos
      select count(*) into v_livres from public.serialized_units
       where product_id = v_prod and store_id = v_store and status = 'available';

      if v_livres > 0 then
        raise exception
          'Este modelo é controlado por IMEI: escolha qual aparelho fica guardado (% disponível(is))',
          v_livres;
      end if;
      -- nenhum disponível: é encomenda mesmo
    else
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

revoke all on function public.reservation_create(jsonb) from public, anon;
grant execute on function public.reservation_create(jsonb) to authenticated;
