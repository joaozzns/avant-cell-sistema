-- Transferência de estoque entre lojas.
--
-- Fluxo: a loja de origem monta a transferência (status 'separating'), envia
-- (o estoque sai de lá e fica "em trânsito") e a loja de destino confere o que
-- chegou. Se chegou menos do que saiu, a transferência fica 'divergent' e o
-- que faltou continua em trânsito, para ninguém "sumir" com aparelho no meio
-- do caminho.

-- ---------- enviar ----------
create or replace function public.transfer_send(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_t      record;
  v_item   record;
  v_unit   record;
  v_saldo  numeric;
  v_qtd    int := 0;
begin
  select * into v_t from public.transfers where id = (p ->> 'transfer_id')::uuid for update;
  if not found then
    raise exception 'Transferência não encontrada';
  end if;
  if v_t.status <> 'separating' then
    raise exception 'Esta transferência já foi enviada (situação: %)', v_t.status;
  end if;
  if not app.has_permission('stock.transfer', v_t.from_store) then
    raise exception 'Você não tem permissão para transferir estoque desta loja';
  end if;

  perform 1 from public.transfer_items where transfer_id = v_t.id;
  if not found then
    raise exception 'Adicione ao menos um item antes de enviar';
  end if;

  for v_item in
    select * from public.transfer_items where transfer_id = v_t.id
  loop
    if v_item.unit_id is not null then
      select id, status, store_id into v_unit
        from public.serialized_units where id = v_item.unit_id for update;
      if not found or v_unit.store_id <> v_t.from_store then
        raise exception 'Aparelho não está na loja de origem';
      end if;
      if v_unit.status <> 'available' then
        raise exception 'Aparelho indisponível para transferir (situação: %)', v_unit.status;
      end if;

      update public.serialized_units
         set status = 'in_transit', updated_at = now()
       where id = v_unit.id;
    else
      select coalesce(qty, 0) into v_saldo
        from public.stock_items
       where store_id = v_t.from_store and product_id = v_item.product_id
         and variant_id is not distinct from v_item.variant_id
         for update;
      if coalesce(v_saldo, 0) < v_item.qty then
        raise exception 'Estoque insuficiente na origem (tem %, precisa de %)', coalesce(v_saldo, 0), v_item.qty;
      end if;

      update public.stock_items
         set qty = qty - v_item.qty
       where store_id = v_t.from_store and product_id = v_item.product_id
         and variant_id is not distinct from v_item.variant_id;

      insert into public.stock_items (store_id, product_id, variant_id, qty, in_transit)
      values (v_t.to_store, v_item.product_id, v_item.variant_id, 0, v_item.qty)
      on conflict (store_id, product_id, variant_id) do update
        set in_transit = public.stock_items.in_transit + v_item.qty;
    end if;

    insert into public.stock_movements
      (company_id, store_id, product_id, variant_id, unit_id, type, qty, ref_table, ref_id, reason, user_id)
    values
      (v_t.company_id, v_t.from_store, v_item.product_id, v_item.variant_id, v_item.unit_id,
       'transfer_out', -v_item.qty, 'transfers', v_t.id, 'Envio para outra loja', auth.uid());
    v_qtd := v_qtd + 1;
  end loop;

  update public.transfers
     set status = 'in_transit', sent_at = now()
   where id = v_t.id;

  return jsonb_build_object('transfer_id', v_t.id, 'itens', v_qtd);
end;
$$;

-- ---------- receber ----------
create or replace function public.transfer_receive(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_t         record;
  v_item      record;
  v_recebido  numeric;
  v_divergiu  boolean := false;
  it          jsonb;
begin
  select * into v_t from public.transfers where id = (p ->> 'transfer_id')::uuid for update;
  if not found then
    raise exception 'Transferência não encontrada';
  end if;
  if v_t.status not in ('in_transit', 'sent') then
    raise exception 'Esta transferência não está em trânsito (situação: %)', v_t.status;
  end if;
  if not app.has_permission('stock.entry', v_t.to_store) then
    raise exception 'Você não tem permissão para receber estoque nesta loja';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    select * into v_item
      from public.transfer_items
     where id = (it ->> 'item_id')::uuid and transfer_id = v_t.id
       for update;
    if not found then
      raise exception 'Item não pertence a esta transferência';
    end if;

    v_recebido := coalesce((it ->> 'qty_received')::numeric, v_item.qty);
    if v_recebido < 0 or v_recebido > v_item.qty then
      raise exception 'Quantidade recebida inválida (enviadas %)', v_item.qty;
    end if;

    update public.transfer_items
       set qty_received = v_recebido,
           divergence = nullif(trim(it ->> 'divergence'), '')
     where id = v_item.id;

    if v_recebido < v_item.qty then
      v_divergiu := true;
    end if;

    if v_item.unit_id is not null then
      if v_recebido >= 1 then
        update public.serialized_units
           set store_id = v_t.to_store, status = 'available', updated_at = now()
         where id = v_item.unit_id;
      end if;
      -- se não chegou, a unidade continua em trânsito, para não sumir do controle
    else
      update public.stock_items
         set in_transit = greatest(in_transit - v_item.qty, 0),
             qty = qty + v_recebido
       where store_id = v_t.to_store and product_id = v_item.product_id
         and variant_id is not distinct from v_item.variant_id;
    end if;

    if v_recebido > 0 then
      insert into public.stock_movements
        (company_id, store_id, product_id, variant_id, unit_id, type, qty, ref_table, ref_id, reason, user_id)
      values
        (v_t.company_id, v_t.to_store, v_item.product_id, v_item.variant_id, v_item.unit_id,
         'transfer_in', v_recebido, 'transfers', v_t.id, 'Recebimento de outra loja', auth.uid());
    end if;
  end loop;

  -- item que nem foi conferido conta como divergência
  perform 1 from public.transfer_items where transfer_id = v_t.id and qty_received is null;
  if found then
    v_divergiu := true;
  end if;

  update public.transfers
     set status = (case when v_divergiu then 'divergent' else 'received' end)::public.transfer_status,
         received_at = now()
   where id = v_t.id;

  return jsonb_build_object('transfer_id', v_t.id, 'divergencia', v_divergiu);
end;
$$;

-- ---------- cancelar (só antes de enviar) ----------
create or replace function public.transfer_cancel(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_t record;
begin
  select * into v_t from public.transfers where id = (p ->> 'transfer_id')::uuid for update;
  if not found then
    raise exception 'Transferência não encontrada';
  end if;
  if v_t.status <> 'separating' then
    raise exception 'Só dá para cancelar antes do envio (situação: %)', v_t.status;
  end if;
  if not app.has_permission('stock.transfer', v_t.from_store) then
    raise exception 'Você não tem permissão para cancelar esta transferência';
  end if;

  update public.transfers set status = 'canceled' where id = v_t.id;
  return jsonb_build_object('transfer_id', v_t.id);
end;
$$;

revoke all on function public.transfer_send(jsonb)    from public, anon;
revoke all on function public.transfer_receive(jsonb) from public, anon;
revoke all on function public.transfer_cancel(jsonb)  from public, anon;
grant execute on function public.transfer_send(jsonb)    to authenticated;
grant execute on function public.transfer_receive(jsonb) to authenticated;
grant execute on function public.transfer_cancel(jsonb)  to authenticated;
