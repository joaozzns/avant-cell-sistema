-- Inventário (balanço de estoque).
--
-- Abre uma contagem para a loja, tirando uma foto do saldo do sistema no
-- momento. A contagem é cega: quem conta digita o que achou na prateleira sem
-- ver o número do sistema. No fechamento, cada diferença vira ajuste de
-- estoque com o valor do impacto, e o saldo passa a ser o contado.
--
-- Cobre produtos comuns (peças e acessórios). Aparelho com IMEI é conferido um
-- a um na lista de aparelhos, onde cada unidade tem situação própria.

create or replace function public.inventory_open(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store  uuid := (p ->> 'store_id')::uuid;
  v_cat    uuid := nullif(p ->> 'category_id', '')::uuid;
  v_cego   boolean := coalesce((p ->> 'blind')::boolean, true);
  v_company uuid;
  v_inv    uuid;
  v_qtd    int;
begin
  select company_id into v_company from public.stores where id = v_store;
  if v_company is null then
    raise exception 'Loja não encontrada';
  end if;
  if not app.has_permission('stock.inventory', v_store) then
    raise exception 'Você não tem permissão para fazer inventário';
  end if;

  perform 1 from public.inventories
   where store_id = v_store and status in ('open', 'counting', 'review');
  if found then
    raise exception 'Já existe um inventário em andamento nesta loja';
  end if;

  insert into public.inventories (company_id, store_id, scope, blind, status, created_by)
  values (v_company, v_store,
          case when v_cat is null then '{"tipo":"total"}'::jsonb
               else jsonb_build_object('tipo', 'categoria', 'category_id', v_cat) end,
          v_cego, 'counting', auth.uid())
  returning id into v_inv;

  -- foto do saldo atual: produtos comuns da loja (com ou sem saldo)
  insert into public.inventory_items (inventory_id, product_id, variant_id, system_qty)
  select v_inv, pr.id, si.variant_id, coalesce(si.qty, 0)
    from public.products pr
    left join public.stock_items si
           on si.product_id = pr.id and si.store_id = v_store
   where pr.company_id = v_company
     and pr.active
     and pr.track_stock
     and not pr.serialized
     and (v_cat is null or pr.category_id = v_cat);
  get diagnostics v_qtd = row_count;

  return jsonb_build_object('inventory_id', v_inv, 'itens', v_qtd);
end;
$$;

create or replace function public.inventory_count(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inv  record;
  v_qtd  int := 0;
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
    update public.inventory_items
       set counted_qty  = case when second_count is null and counted_qty is null
                               then (it ->> 'qty')::numeric else counted_qty end,
           second_count = case when counted_qty is not null
                               then (it ->> 'qty')::numeric else second_count end,
           counted_by   = auth.uid()
     where id = (it ->> 'item_id')::uuid and inventory_id = v_inv.id;
    v_qtd := v_qtd + 1;
  end loop;

  update public.inventories set status = 'counting' where id = v_inv.id;
  return jsonb_build_object('contados', v_qtd);
end;
$$;

create or replace function public.inventory_close(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inv     record;
  v_item    record;
  v_final   numeric;
  v_dif     numeric;
  v_custo   numeric;
  v_ajustes int := 0;
  v_impacto numeric := 0;
begin
  select * into v_inv from public.inventories where id = (p ->> 'inventory_id')::uuid for update;
  if not found then
    raise exception 'Inventário não encontrado';
  end if;
  if v_inv.status = 'closed' then
    raise exception 'Este inventário já foi fechado';
  end if;
  if not app.has_permission('stock.adjust_approve', v_inv.store_id) then
    raise exception 'Fechar inventário exige permissão de aprovar ajuste de estoque';
  end if;

  for v_item in
    select ii.*, coalesce(nullif(pr.avg_cost, 0), pr.cost, 0) as custo
      from public.inventory_items ii
      join public.products pr on pr.id = ii.product_id
     where ii.inventory_id = v_inv.id
       and coalesce(ii.second_count, ii.counted_qty) is not null
  loop
    v_final := coalesce(v_item.second_count, v_item.counted_qty);
    v_dif   := v_final - v_item.system_qty;
    v_custo := v_item.custo;

    update public.inventory_items
       set final_qty = v_final,
           diff_value = round(v_dif * v_custo, 2)
     where id = v_item.id;

    if v_dif = 0 then
      continue;
    end if;

    -- saldo passa a ser o contado
    insert into public.stock_items (store_id, product_id, variant_id, qty)
    values (v_inv.store_id, v_item.product_id, v_item.variant_id, v_final)
    on conflict (store_id, product_id, variant_id) do update set qty = v_final;

    insert into public.stock_adjustments
      (company_id, store_id, product_id, variant_id, type, qty, reason, value_impact, approved_by, created_by)
    values
      (v_inv.company_id, v_inv.store_id, v_item.product_id, v_item.variant_id,
       (case when v_dif > 0 then 'adjustment_in' else 'adjustment_out' end)::public.stock_move_type,
       abs(v_dif), 'Inventário ' || to_char(now(), 'DD/MM/YYYY'),
       round(v_dif * v_custo, 2), auth.uid(), auth.uid());

    insert into public.stock_movements
      (company_id, store_id, product_id, variant_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
    values
      (v_inv.company_id, v_inv.store_id, v_item.product_id, v_item.variant_id,
       (case when v_dif > 0 then 'adjustment_in' else 'adjustment_out' end)::public.stock_move_type,
       v_dif, v_custo, 'inventories', v_inv.id, 'Ajuste por inventário', auth.uid());

    v_ajustes := v_ajustes + 1;
    v_impacto := v_impacto + round(v_dif * v_custo, 2);
  end loop;

  update public.inventories
     set status = 'closed', closed_at = now(), approved_by = auth.uid()
   where id = v_inv.id;

  return jsonb_build_object('ajustes', v_ajustes, 'impacto', v_impacto);
end;
$$;

revoke all on function public.inventory_open(jsonb)  from public, anon;
revoke all on function public.inventory_count(jsonb) from public, anon;
revoke all on function public.inventory_close(jsonb) from public, anon;
grant execute on function public.inventory_open(jsonb)  to authenticated;
grant execute on function public.inventory_count(jsonb) to authenticated;
grant execute on function public.inventory_close(jsonb) to authenticated;
