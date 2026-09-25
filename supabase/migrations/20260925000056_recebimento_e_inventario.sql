-- Recebimento de pedido de compra e contagem de inventário
--
-- Defeitos corrigidos:
--   1. po_receive aceitava receber mais do que foi pedido (55 de um pedido de 30),
--      somando a diferença no estoque e na conta a pagar.
--   2. po_receive não verificava permissão nenhuma: qualquer usuário da empresa
--      dava entrada de mercadoria em qualquer loja.
--   3. Quando nenhum item vinha com quantidade válida (payload errado, por exemplo),
--      a função criava uma entrada vazia com total 0 e mudava a situação do pedido,
--      sem avisar ninguém.
--   4. inventory_count aceitava contagem negativa, que virava ajuste de saída e
--      deixava o saldo negativo no fechamento; e item de outro inventário era
--      "contado" em silêncio.

create or replace function public.po_receive(p jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_po record; it jsonb; v_item record; v_cost numeric; v_qty numeric;
  v_entry uuid; v_total numeric := 0; v_all_received boolean;
  v_old record; v_frete numeric; v_saldo numeric; v_recebidos int := 0;
begin
  select * into v_po from public.purchase_orders
   where id = (p ->> 'po_id')::uuid for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_po.status in ('received','canceled') then
    raise exception 'Pedido já recebido ou cancelado';
  end if;

  if not app.has_permission('stock.entry', v_po.store_id) then
    raise exception 'Você não tem permissão para dar entrada de mercadoria nesta loja';
  end if;

  v_frete := coalesce((p ->> 'freight')::numeric, 0);
  if v_frete < 0 then
    raise exception 'O frete não pode ser negativo';
  end if;

  if jsonb_typeof(p -> 'items') is distinct from 'array'
     or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Informe ao menos um item recebido';
  end if;

  insert into public.stock_entries
    (company_id, store_id, supplier_id, purchase_order_id, invoice_number,
     freight, status, created_by, completed_at)
  values
    (v_po.company_id, v_po.store_id, v_po.supplier_id, v_po.id,
     nullif(p ->> 'invoice_number', ''),
     v_frete, 'completed', auth.uid(), now())
  returning id into v_entry;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (it ->> 'qty_received')::numeric;
    if v_qty is null or v_qty = 0 then continue; end if;
    if v_qty < 0 then
      raise exception 'Quantidade recebida não pode ser negativa';
    end if;

    select * into v_item from public.purchase_order_items
     where id = (it ->> 'item_id')::uuid and po_id = v_po.id for update;
    if not found then raise exception 'Item do pedido não encontrado'; end if;

    v_saldo := v_item.qty - coalesce(v_item.qty_received, 0);
    if v_qty > v_saldo then
      raise exception 'Este item já tem % de % recebidas: ainda faltam %, não % (use um novo pedido para o excedente)',
        coalesce(v_item.qty_received, 0), v_item.qty, greatest(v_saldo, 0), v_qty;
    end if;

    v_cost := coalesce((it ->> 'unit_cost')::numeric, v_item.unit_cost);
    if v_cost is null or v_cost < 0 then
      raise exception 'Custo unitário inválido';
    end if;
    v_total := v_total + v_qty * v_cost;
    v_recebidos := v_recebidos + 1;

    insert into public.stock_entry_items
      (entry_id, product_id, variant_id, qty_expected, qty_received, unit_cost)
    values
      (v_entry, v_item.product_id, v_item.variant_id, v_item.qty, v_qty, v_cost);

    update public.purchase_order_items
       set qty_received = coalesce(qty_received, 0) + v_qty
     where id = v_item.id;

    select coalesce(si.qty, 0) as qty, coalesce(nullif(pr.avg_cost, 0), pr.cost) as avg_cost
      into v_old
      from public.products pr
      left join public.stock_items si
        on si.product_id = pr.id and si.store_id = v_po.store_id and si.variant_id is null
     where pr.id = v_item.product_id;

    update public.products
       set cost = v_cost,
           avg_cost = case
             when greatest(v_old.qty, 0) + v_qty = 0 then v_cost
             else (greatest(v_old.qty, 0) * coalesce(v_old.avg_cost, v_cost) + v_qty * v_cost)
                  / (greatest(v_old.qty, 0) + v_qty)
           end
     where id = v_item.product_id;

    insert into public.stock_items (store_id, product_id, variant_id, qty)
    values (v_po.store_id, v_item.product_id, v_item.variant_id, v_qty)
    on conflict (store_id, product_id, variant_id) do update
      set qty = public.stock_items.qty + excluded.qty;

    insert into public.stock_movements
      (company_id, store_id, product_id, variant_id, type, qty, unit_cost,
       ref_table, ref_id, user_id)
    values
      (v_po.company_id, v_po.store_id, v_item.product_id, v_item.variant_id,
       'purchase_in', v_qty, v_cost, 'stock_entries', v_entry, auth.uid());
  end loop;

  if v_recebidos = 0 then
    raise exception 'Nenhum item com quantidade recebida: o recebimento não foi registrado';
  end if;

  v_total := v_total + v_frete;
  update public.stock_entries set total = v_total where id = v_entry;

  if v_total > 0 then
    insert into public.payables
      (company_id, store_id, supplier_id, entry_id, po_id, description,
       due_date, amount, created_by)
    values
      (v_po.company_id, v_po.store_id, v_po.supplier_id, v_entry, v_po.id,
       'Pedido #' || v_po.number || coalesce(' · NF ' || nullif(p ->> 'invoice_number',''), ''),
       coalesce((p ->> 'due_date')::date, current_date + 30), v_total, auth.uid());
  end if;

  select bool_and(coalesce(qty_received, 0) >= qty) into v_all_received
    from public.purchase_order_items where po_id = v_po.id;
  update public.purchase_orders
     set status = case when v_all_received then 'received'::public.po_status
                       else 'partial'::public.po_status end
   where id = v_po.id;

  return jsonb_build_object('entry_id', v_entry, 'total', v_total,
                            'fully_received', v_all_received);
end;
$$;

create or replace function public.inventory_count(p jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_inv  record;
  v_qtd  int := 0;
  v_q    numeric;
  it     jsonb;
begin
  select * into v_inv from public.inventories where id = (p ->> 'inventory_id')::uuid for update;
  if not found then
    raise exception 'Inventário não encontrado';
  end if;
  if v_inv.status not in ('open', 'counting', 'review') then
    raise exception 'Este inventário já foi fechado';
  end if;
  if not app.has_permission('stock.inventory', v_inv.store_id) then
    raise exception 'Você não tem permissão para contar';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    v_q := (it ->> 'qty')::numeric;
    if v_q is null then
      raise exception 'Informe a quantidade contada de cada item';
    end if;
    if v_q < 0 then
      raise exception 'Quantidade contada não pode ser negativa';
    end if;

    update public.inventory_items
       set counted_qty  = case when second_count is null and counted_qty is null
                               then v_q else counted_qty end,
           second_count = case when counted_qty is not null
                               then v_q else second_count end,
           counted_by   = auth.uid()
     where id = (it ->> 'item_id')::uuid and inventory_id = v_inv.id;
    if not found then
      raise exception 'Item não pertence a este inventário';
    end if;
    v_qtd := v_qtd + 1;
  end loop;

  update public.inventories set status = 'counting' where id = v_inv.id;
  return jsonb_build_object('contados', v_qtd);
end;
$$;
