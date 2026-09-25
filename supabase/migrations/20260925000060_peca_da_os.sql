-- Aplicar peça na OS furava o estoque
--
-- Sondagem de 25/09/2026: uma peça com 1 unidade em estoque foi aplicada em
-- quantidade 40. O saldo foi para -39, R$ 1.200,00 de custo entraram na OS e
-- nenhum erro apareceu. É o mesmo buraco que o PDV tinha (migração 054) e o
-- ajuste de estoque tinha (055), na terceira porta: a bancada do técnico.
--
-- Também não havia permissão nenhuma: qualquer usuário da empresa aplicava
-- peça em qualquer OS. Passa a exigir `os.diagnose`, que é o que técnico e
-- gerente já têm e o vendedor não.

create or replace function public.os_apply_part(p_part uuid)
returns void
language plpgsql
set search_path to ''
as $$
declare v_part record; v_os record; v_saldo numeric; v_nome text;
begin
  select * into v_part from public.os_parts where id = p_part for update;
  if not found then raise exception 'Peça da OS não encontrada'; end if;
  if v_part.status not in ('requested','reserved') then
    raise exception 'Peça não está reservada (status: %)', v_part.status;
  end if;
  if v_part.qty is null or v_part.qty <= 0 then
    raise exception 'Quantidade inválida na peça';
  end if;

  select store_id, company_id into v_os
    from public.service_orders where id = v_part.os_id;

  if not app.has_permission('os.diagnose', v_os.store_id) then
    raise exception 'Você não tem permissão para aplicar peça na OS';
  end if;

  /* a peça reservada já está separada da prateleira, mas o saldo continua
     sendo o saldo: sem isto a bancada consumia o que a loja não tinha */
  select coalesce(qty, 0) into v_saldo
    from public.stock_items
   where store_id = v_os.store_id and product_id = v_part.product_id
     and variant_id is null
     for update;

  select name into v_nome from public.products where id = v_part.product_id;

  if v_saldo is null then
    raise exception 'Não há % nesta loja: dê entrada antes de aplicar', coalesce(v_nome, 'esta peça');
  end if;
  if v_saldo < v_part.qty then
    raise exception 'Estoque insuficiente de %: % em estoque para aplicar %',
      coalesce(v_nome, 'peça'),
      trim(to_char(v_saldo, 'FM999990.###')),
      trim(to_char(v_part.qty, 'FM999990.###'));
  end if;

  update public.stock_items
     set qty = qty - v_part.qty,
         reserved = greatest(reserved - v_part.qty, 0)
   where store_id = v_os.store_id and product_id = v_part.product_id and variant_id is null;

  insert into public.stock_movements
    (company_id, store_id, product_id, type, qty, unit_cost, ref_table, ref_id, user_id)
  values
    (v_os.company_id, v_os.store_id, v_part.product_id, 'os_use',
     -v_part.qty, v_part.unit_cost, 'service_orders', v_part.os_id, auth.uid());

  update public.os_parts
     set status = 'applied', applied_at = now(), technician_id = auth.uid()
   where id = p_part;

  update public.service_orders
     set cost_parts = cost_parts + v_part.qty * v_part.unit_cost
   where id = v_part.os_id;
end;
$$;

create or replace function public.os_return_part(p_part uuid)
returns void
language plpgsql
set search_path to ''
as $$
declare v_part record; v_os record;
begin
  select * into v_part from public.os_parts where id = p_part for update;
  if not found then raise exception 'Peça da OS não encontrada'; end if;

  select store_id into v_os from public.service_orders where id = v_part.os_id;

  if not app.has_permission('os.diagnose', v_os.store_id) then
    raise exception 'Você não tem permissão para devolver peça da OS';
  end if;

  if v_part.status = 'applied' then
    raise exception 'Peça já aplicada: use ajuste de estoque para reverter';
  end if;
  if v_part.status = 'reserved' then
    update public.stock_items
       set reserved = greatest(reserved - v_part.qty, 0)
     where store_id = v_os.store_id and product_id = v_part.product_id and variant_id is null;
  end if;

  update public.os_parts set status = 'returned' where id = p_part;
end;
$$;
