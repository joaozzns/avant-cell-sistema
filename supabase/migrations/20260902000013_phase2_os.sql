-- ============================================================
-- AVANT CELL · Fase 2 · Assistência técnica
-- Peças (reserva/baixa atômica), entrega com venda vinculada
-- e consulta/aprovação pública por token (sem login)
-- ============================================================

-- ---------- Requisitar peça: insere já reservando o estoque ----------
create or replace function public.os_request_part(
  p_os uuid, p_product uuid, p_qty numeric, p_unit_price numeric
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_os record; v_part uuid; v_cost numeric;
begin
  select id, store_id, company_id into v_os
    from public.service_orders where id = p_os;
  if not found then raise exception 'OS não encontrada'; end if;

  select coalesce(nullif(avg_cost, 0), cost) into v_cost
    from public.products where id = p_product and company_id = v_os.company_id;
  if v_cost is null then raise exception 'Peça não encontrada'; end if;

  insert into public.os_parts (os_id, product_id, qty, unit_cost, unit_price, status, technician_id)
  values (p_os, p_product, p_qty, v_cost, p_unit_price, 'reserved', auth.uid())
  returning id into v_part;

  -- Peça reservada some do estoque disponível para venda
  insert into public.stock_items (store_id, product_id, variant_id, qty, reserved)
  values (v_os.store_id, p_product, null, 0, p_qty)
  on conflict (store_id, product_id, variant_id) do update
    set reserved = public.stock_items.reserved + p_qty;

  return v_part;
end;
$$;
grant execute on function public.os_request_part(uuid, uuid, numeric, numeric) to authenticated;

-- ---------- Aplicar peça: baixa efetiva com técnico e custo ----------
create or replace function public.os_apply_part(p_part uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare v_part record; v_os record;
begin
  select * into v_part from public.os_parts where id = p_part for update;
  if not found then raise exception 'Peça da OS não encontrada'; end if;
  if v_part.status not in ('requested','reserved') then
    raise exception 'Peça não está reservada (status: %)', v_part.status;
  end if;

  select store_id, company_id into v_os
    from public.service_orders where id = v_part.os_id;

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

  -- Custo da peça entra na margem daquela OS
  update public.service_orders
     set cost_parts = cost_parts + v_part.qty * v_part.unit_cost
   where id = v_part.os_id;
end;
$$;
grant execute on function public.os_apply_part(uuid) to authenticated;

-- ---------- Devolver peça não utilizada ----------
create or replace function public.os_return_part(p_part uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare v_part record; v_os record;
begin
  select * into v_part from public.os_parts where id = p_part for update;
  if not found then raise exception 'Peça da OS não encontrada'; end if;

  select store_id into v_os from public.service_orders where id = v_part.os_id;

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
grant execute on function public.os_return_part(uuid) to authenticated;

-- ---------- Entrega (check-out): gera a venda sem tocar de novo no estoque ----------
-- (peças já foram baixadas no os_apply_part)
-- payload: { os_id, delivered_to?, exit_checklist?, payments:[{kind, amount, installments?, change_given?}] }
create or replace function public.deliver_os(p jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_os record; v_quote record; v_session uuid; v_company uuid;
  v_sale uuid; v_number bigint; v_total numeric := 0; v_paid numeric := 0;
  v_cash_in numeric := 0;
  it record; pay jsonb; v_labor_product uuid;
begin
  select * into v_os from public.service_orders
   where id = (p ->> 'os_id')::uuid for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if v_os.status not in ('ready','unrepaired') then
    raise exception 'OS precisa estar Pronta (ou Sem reparo) para entrega';
  end if;
  v_company := v_os.company_id;

  -- Total: orçamento aprovado + taxa de diagnóstico quando sem reparo
  select * into v_quote from public.os_quotes
   where os_id = v_os.id and status in ('approved','partially_approved')
   order by version desc limit 1;

  if v_os.status = 'ready' then
    if v_quote.id is null then
      raise exception 'OS sem orçamento aprovado registrado';
    end if;
    select coalesce(sum(qty * unit_price), 0) into v_total
      from public.os_quote_items
     where quote_id = v_quote.id and coalesce(approved, true);
  else
    v_total := coalesce(v_os.diagnosis_fee, 0);   -- sem reparo: só diagnóstico
  end if;

  -- Pagamentos precisam fechar com o total (quando há valor)
  for pay in select * from jsonb_array_elements(coalesce(p -> 'payments', '[]'::jsonb)) loop
    v_paid := v_paid + (pay ->> 'amount')::numeric
              - coalesce((pay ->> 'change_given')::numeric, 0);
  end loop;
  if round(v_paid, 2) <> round(v_total, 2) then
    raise exception 'Pagamentos (%) não fecham com o total da OS (%)', v_paid, v_total;
  end if;

  if v_total > 0 then
    select id into v_session from public.cash_sessions
     where store_id = v_os.store_id and opened_by = auth.uid() and status = 'open';
    if v_session is null then
      raise exception 'Abra o caixa para receber a entrega';
    end if;

    -- Produto genérico para itens sem vínculo de catálogo (mão de obra)
    select id into v_labor_product from public.products
     where company_id = v_company and type = 'service' and name = 'Mão de obra (OS)';
    if v_labor_product is null then
      insert into public.products (company_id, type, name, track_stock, sale_price)
      values (v_company, 'service', 'Mão de obra (OS)', false, 0)
      returning id into v_labor_product;
    end if;

    v_number := app.next_store_number(v_os.store_id, 'sale');
    insert into public.sales
      (company_id, store_id, number, status, customer_id, seller_id, cash_session_id,
       subtotal, discount, total, source, source_id, created_by, completed_at)
    values
      (v_company, v_os.store_id, v_number, 'completed', v_os.customer_id, auth.uid(),
       v_session, v_total, 0, v_total, 'os', v_os.id, auth.uid(), now())
    returning id into v_sale;

    if v_os.status = 'ready' then
      for it in
        select qi.*, pr.id as prod_id
          from public.os_quote_items qi
          left join public.products pr on pr.id = qi.product_id
         where qi.quote_id = v_quote.id and coalesce(qi.approved, true)
      loop
        insert into public.sale_items
          (sale_id, product_id, qty, unit_price, unit_cost, total, note)
        values
          (v_sale, coalesce(it.prod_id, v_labor_product), it.qty, it.unit_price,
           0, it.qty * it.unit_price, it.description);
      end loop;
    else
      insert into public.sale_items (sale_id, product_id, qty, unit_price, unit_cost, total, note)
      values (v_sale, v_labor_product, 1, v_total, 0, v_total, 'Taxa de diagnóstico');
    end if;

    for pay in select * from jsonb_array_elements(p -> 'payments') loop
      insert into public.sale_payments
        (sale_id, kind, amount, installments, change_given)
      values
        (v_sale, (pay ->> 'kind')::public.payment_kind, (pay ->> 'amount')::numeric,
         coalesce((pay ->> 'installments')::int, 1),
         coalesce((pay ->> 'change_given')::numeric, 0));
      if (pay ->> 'kind') = 'cash' then
        v_cash_in := v_cash_in + (pay ->> 'amount')::numeric
                     - coalesce((pay ->> 'change_given')::numeric, 0);
      end if;
    end loop;

    if v_cash_in > 0 then
      insert into public.cash_movements (session_id, store_id, type, amount, ref_id, user_id)
      values (v_session, v_os.store_id, 'sale', v_cash_in, v_sale, auth.uid());
    end if;
  end if;

  -- A partir da entrega começa a contagem da garantia do serviço
  update public.service_orders
     set status = 'delivered',
         delivered_at = now(),
         delivered_to = nullif(p ->> 'delivered_to', ''),
         exit_checklist = coalesce(p -> 'exit_checklist', exit_checklist),
         sale_id = v_sale,
         total = v_total,
         warranty_until = (current_date + warranty_days),
         charged_diagnosis = (v_os.status = 'unrepaired' and v_total > 0)
   where id = v_os.id;

  return jsonb_build_object('sale_id', v_sale, 'number', v_number, 'total', v_total);
end;
$$;
grant execute on function public.deliver_os(jsonb) to authenticated;

-- ---------- Consulta pública por token (sem login, dados limitados) ----------
create or replace function public.public_os_get(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_os record; v_quote record; v_result jsonb;
begin
  select o.id, o.number, o.status, o.priority, o.created_at, o.deadline,
         o.delivered_at, o.warranty_until, o.reported_issue,
         s.name as store_name, s.phone as store_phone,
         c.name as customer_first_name
    into v_os
    from public.service_orders o
    join public.stores s on s.id = o.store_id
    join public.customers c on c.id = o.customer_id
   where o.public_token = p_token;
  if not found then return null; end if;

  select id, version, status, total, valid_until, execution_days
    into v_quote
    from public.os_quotes
   where os_id = v_os.id and status in ('sent','approved','partially_approved')
   order by version desc limit 1;

  v_result := jsonb_build_object(
    'number', v_os.number,
    'status', v_os.status,
    'created_at', v_os.created_at,
    'deadline', v_os.deadline,
    'delivered_at', v_os.delivered_at,
    'warranty_until', v_os.warranty_until,
    'reported_issue', v_os.reported_issue,
    'store_name', v_os.store_name,
    'store_phone', v_os.store_phone,
    'customer_name', split_part(v_os.customer_first_name, ' ', 1),
    'timeline', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'to_status', h.to_status, 'at', h.created_at) order by h.created_at), '[]'::jsonb)
      from public.os_status_history h where h.os_id = v_os.id
    )
  );

  -- Orçamento visível apenas com itens e preços (nunca custo nem comentários internos)
  if v_quote.id is not null then
    v_result := v_result || jsonb_build_object('quote', jsonb_build_object(
      'id', v_quote.id,
      'status', v_quote.status,
      'total', v_quote.total,
      'valid_until', v_quote.valid_until,
      'execution_days', v_quote.execution_days,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'description', qi.description, 'qty', qi.qty,
          'unit_price', qi.unit_price, 'warranty_days', qi.warranty_days)
          order by qi.description), '[]'::jsonb)
        from public.os_quote_items qi where qi.quote_id = v_quote.id
      )
    ));
  end if;

  return v_result;
end;
$$;
grant execute on function public.public_os_get(uuid) to anon, authenticated;

-- ---------- Aprovação/recusa pelo link público ----------
create or replace function public.public_os_decide(
  p_token uuid, p_approve boolean, p_reason text default null, p_ip text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_os record; v_quote record;
begin
  select id, status into v_os from public.service_orders where public_token = p_token;
  if not found then raise exception 'OS não encontrada'; end if;
  if v_os.status <> 'awaiting_approval' then
    raise exception 'Esta OS não está aguardando aprovação';
  end if;

  select id into v_quote from public.os_quotes
   where os_id = v_os.id and status = 'sent'
   order by version desc limit 1;
  if v_quote.id is null then raise exception 'Nenhum orçamento enviado'; end if;

  if p_approve then
    update public.os_quotes
       set status = 'approved', decided_at = now(),
           approval_channel = 'link', approval_ip = nullif(p_ip, '')::inet
     where id = v_quote.id;
    update public.service_orders set status = 'approved' where id = v_os.id;
  else
    update public.os_quotes
       set status = 'rejected', decided_at = now(),
           approval_channel = 'link', approval_ip = nullif(p_ip, '')::inet,
           rejection_reason = p_reason, return_device = true
     where id = v_quote.id;
    update public.service_orders set status = 'unrepaired' where id = v_os.id;
  end if;

  return jsonb_build_object('ok', true, 'approved', p_approve);
end;
$$;
grant execute on function public.public_os_decide(uuid, boolean, text, text) to anon, authenticated;
