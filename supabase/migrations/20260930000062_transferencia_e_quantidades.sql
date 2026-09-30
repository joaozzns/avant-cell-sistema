-- Transferência entre lojas: o que ela ainda deixava passar
--
-- O `transfer_send` já conferia permissão, situação e saldo. Faltavam três
-- coisas, todas encontradas lendo o código com o `complete_sale` ao lado:
--
--   1. Ele olhava `qty`, e não `qty - reserved`. O que está reservado é de um
--      cliente que já pagou sinal ou está esperando; dava para mandar essa
--      mercadoria para outra loja e deixar a reserva sem lastro. O PDV já
--      respeita a reserva desde sempre; a transferência não.
--   2. Nenhuma tabela de quantidade tinha restrição de valor: um item de
--      transferência com quantidade negativa faria `qty = qty - (-5)`, ou seja,
--      **aumentaria** o estoque da origem ao "enviar".
--   3. Nada impedia transferir de uma loja para ela mesma, o que só criaria
--      um `in_transit` fantasma na própria origem.

alter table public.transfer_items
  add constraint transfer_items_qty_positiva check (qty > 0);

alter table public.os_parts
  add constraint os_parts_qty_positiva check (qty > 0);

create or replace function public.transfer_send(p jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_t      record;
  v_item   record;
  v_unit   record;
  v_saldo  numeric;
  v_nome   text;
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
  if v_t.from_store = v_t.to_store then
    raise exception 'Origem e destino são a mesma loja';
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
      /* o que está reservado é de um cliente que está esperando: não sai da
         loja numa transferência, do mesmo jeito que não sai numa venda */
      select coalesce(qty, 0) - coalesce(reserved, 0) into v_saldo
        from public.stock_items
       where store_id = v_t.from_store and product_id = v_item.product_id
         and variant_id is not distinct from v_item.variant_id
         for update;

      if coalesce(v_saldo, 0) < v_item.qty then
        select name into v_nome from public.products where id = v_item.product_id;
        raise exception 'Estoque insuficiente de % na origem: % disponível(is) para enviar %',
          coalesce(v_nome, 'produto'),
          trim(to_char(coalesce(v_saldo, 0), 'FM999990.###')),
          trim(to_char(v_item.qty, 'FM999990.###'));
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
