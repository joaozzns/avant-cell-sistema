-- Corrige o recebimento parcial de transferência.
--
-- Encontrado no teste: saíram 5 capinhas da loja 1, chegaram 3 na loja 2 e as
-- 2 que faltaram sumiram do estoque da empresa — a origem baixou 5, o destino
-- somou 3 e o restante saía do "em trânsito" sem virar nada.
--
-- Agora só sai do trânsito o que foi conferido. O que faltou continua em
-- trânsito no destino, do mesmo jeito que já acontecia com o aparelho com
-- IMEI, até alguém resolver a divergência.

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
      -- só sai do trânsito o que realmente chegou; a diferença continua
      -- em trânsito no destino, aparecendo como pendência a resolver
      update public.stock_items
         set in_transit = greatest(in_transit - v_recebido, 0),
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

