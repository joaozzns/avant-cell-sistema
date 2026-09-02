-- ============================================================
-- AVANT CELL · Fase 3 · Compras e financeiro
-- Crediário no PDV, recebimento de pedido de compra com custo
-- médio, e baixa de contas a receber/pagar
-- ============================================================

-- ---------- Baixa de contas a receber ----------
-- p_account null = recebe no caixa aberto do operador (dinheiro no balcão)
create or replace function public.settle_receivable(
  p_id uuid, p_amount numeric,
  p_interest numeric default 0, p_discount numeric default 0,
  p_account uuid default null
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_r record; v_session uuid; v_due numeric;
begin
  select * into v_r from public.receivables where id = p_id for update;
  if not found then raise exception 'Conta a receber não encontrada'; end if;
  if v_r.status not in ('open','partial') then
    raise exception 'Esta conta não está em aberto (status: %)', v_r.status;
  end if;
  if p_amount <= 0 then raise exception 'Valor inválido'; end if;

  v_due := v_r.amount + v_r.interest + p_interest + v_r.fine
           - v_r.discount - p_discount - v_r.paid_amount;
  if round(p_amount, 2) > round(v_due, 2) then
    raise exception 'Valor maior que o saldo da parcela (%)', v_due;
  end if;

  if p_account is null then
    select id into v_session from public.cash_sessions
     where store_id = v_r.store_id and opened_by = auth.uid() and status = 'open';
    if v_session is null then
      raise exception 'Abra o caixa ou informe a conta de destino';
    end if;
    insert into public.cash_movements (session_id, store_id, type, amount, reason, ref_id, user_id)
    values (v_session, v_r.store_id, 'receivable_payment', p_amount,
            'Recebimento: ' || v_r.description, v_r.id, auth.uid());
  else
    insert into public.transactions
      (company_id, account_id, store_id, kind, amount, category_id, ref_table, ref_id, description, created_by)
    values
      (v_r.company_id, p_account, v_r.store_id, 'in', p_amount, v_r.category_id,
       'receivables', v_r.id, 'Recebimento: ' || v_r.description, auth.uid());
  end if;

  update public.receivables
     set paid_amount = paid_amount + p_amount,
         interest = interest + p_interest,
         discount = discount + p_discount,
         account_id = coalesce(p_account, account_id),
         cash_session_id = coalesce(v_session, cash_session_id),
         paid_at = case when round(paid_amount + p_amount, 2) >= round(amount + interest + p_interest + fine - discount - p_discount, 2)
                        then now() else paid_at end,
         status = case when round(paid_amount + p_amount, 2) >= round(amount + interest + p_interest + fine - discount - p_discount, 2)
                       then 'paid'::public.bill_status else 'partial'::public.bill_status end
   where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.settle_receivable(uuid, numeric, numeric, numeric, uuid) to authenticated;

-- ---------- Baixa de contas a pagar ----------
create or replace function public.settle_payable(
  p_id uuid, p_amount numeric, p_account uuid
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_p record;
begin
  select * into v_p from public.payables where id = p_id for update;
  if not found then raise exception 'Conta a pagar não encontrada'; end if;
  if v_p.status not in ('open','partial') then
    raise exception 'Esta conta não está em aberto (status: %)', v_p.status;
  end if;
  if p_amount <= 0 or round(p_amount, 2) > round(v_p.amount - v_p.paid_amount, 2) then
    raise exception 'Valor inválido (saldo: %)', v_p.amount - v_p.paid_amount;
  end if;

  insert into public.transactions
    (company_id, account_id, store_id, kind, amount, category_id, cost_center_id,
     ref_table, ref_id, description, created_by)
  values
    (v_p.company_id, p_account, v_p.store_id, 'out', p_amount, v_p.category_id,
     v_p.cost_center_id, 'payables', v_p.id, 'Pagamento: ' || v_p.description, auth.uid());

  update public.payables
     set paid_amount = paid_amount + p_amount,
         account_id = p_account,
         paid_at = case when round(paid_amount + p_amount, 2) >= round(amount, 2) then now() else paid_at end,
         status = case when round(paid_amount + p_amount, 2) >= round(amount, 2)
                       then 'paid'::public.bill_status else 'partial'::public.bill_status end
   where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.settle_payable(uuid, numeric, uuid) to authenticated;

-- ---------- Recebimento de pedido de compra ----------
-- payload: { po_id, invoice_number?, freight?, due_date?,
--            items: [{item_id, qty_received, unit_cost?}] }
create or replace function public.po_receive(p jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_po record; it jsonb; v_item record; v_cost numeric; v_qty numeric;
  v_entry uuid; v_total numeric := 0; v_all_received boolean;
  v_old record;
begin
  select * into v_po from public.purchase_orders
   where id = (p ->> 'po_id')::uuid for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_po.status in ('received','canceled') then
    raise exception 'Pedido já recebido ou cancelado';
  end if;

  insert into public.stock_entries
    (company_id, store_id, supplier_id, purchase_order_id, invoice_number,
     freight, status, created_by, completed_at)
  values
    (v_po.company_id, v_po.store_id, v_po.supplier_id, v_po.id,
     nullif(p ->> 'invoice_number', ''),
     coalesce((p ->> 'freight')::numeric, 0), 'completed', auth.uid(), now())
  returning id into v_entry;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (it ->> 'qty_received')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;

    select * into v_item from public.purchase_order_items
     where id = (it ->> 'item_id')::uuid and po_id = v_po.id for update;
    if not found then raise exception 'Item do pedido não encontrado'; end if;

    v_cost := coalesce((it ->> 'unit_cost')::numeric, v_item.unit_cost);
    v_total := v_total + v_qty * v_cost;

    insert into public.stock_entry_items
      (entry_id, product_id, variant_id, qty_expected, qty_received, unit_cost)
    values
      (v_entry, v_item.product_id, v_item.variant_id, v_item.qty, v_qty, v_cost);

    update public.purchase_order_items
       set qty_received = qty_received + v_qty
     where id = v_item.id;

    -- Custo médio recalculado na conclusão da entrada
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

  v_total := v_total + coalesce((p ->> 'freight')::numeric, 0);
  update public.stock_entries set total = v_total where id = v_entry;

  -- Contas a pagar da nota
  if v_total > 0 then
    insert into public.payables
      (company_id, store_id, supplier_id, entry_id, po_id, description,
       due_date, amount, created_by)
    values
      (v_po.company_id, v_po.store_id, v_po.supplier_id, v_entry, v_po.id,
       'Pedido #' || v_po.number || coalesce(' · NF ' || nullif(p ->> 'invoice_number',''), ''),
       coalesce((p ->> 'due_date')::date, current_date + 30), v_total, auth.uid());
  end if;

  select bool_and(qty_received >= qty) into v_all_received
    from public.purchase_order_items where po_id = v_po.id;
  update public.purchase_orders
     set status = case when v_all_received then 'received'::public.po_status
                       else 'partial'::public.po_status end
   where id = v_po.id;

  return jsonb_build_object('entry_id', v_entry, 'total', v_total,
                            'fully_received', v_all_received);
end;
$$;
grant execute on function public.po_receive(jsonb) to authenticated;

-- ---------- Crediário no PDV ----------
-- complete_sale passa a aceitar kind = 'credit_plan': exige cliente e
-- gera as parcelas no contas a receber (30/60/90…)
create or replace function app.create_credit_installments(
  p_sale uuid, p_amount numeric, p_n int, p_first_due date
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale record; i int; v_each numeric; v_last numeric;
begin
  select * into v_sale from public.sales where id = p_sale;
  if v_sale.customer_id is null then
    raise exception 'Crediário exige cliente cadastrado na venda';
  end if;

  -- Cliente bloqueado não compra a prazo
  perform 1 from public.customer_credit_profiles
   where customer_id = v_sale.customer_id and blocked;
  if found then
    raise exception 'Cliente bloqueado para novas compras a prazo';
  end if;

  v_each := trunc(p_amount / p_n, 2);
  v_last := p_amount - v_each * (p_n - 1);

  for i in 1..p_n loop
    insert into public.receivables
      (company_id, store_id, customer_id, sale_id, description,
       installment_no, installments_total, due_date, original_due_date, amount)
    values
      (v_sale.company_id, v_sale.store_id, v_sale.customer_id, p_sale,
       'Venda #' || v_sale.number || ' · parcela ' || i || '/' || p_n,
       i, p_n,
       p_first_due + ((i - 1) * interval '30 days'),
       p_first_due + ((i - 1) * interval '30 days'),
       case when i = p_n then v_last else v_each end);
  end loop;
end;
$$;

create or replace function app.handle_credit_plan_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'credit_plan' then
    perform app.create_credit_installments(
      new.sale_id, new.amount, greatest(new.installments, 1),
      current_date + 30);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_credit_plan on public.sale_payments;
create trigger trg_credit_plan
  after insert on public.sale_payments
  for each row execute function app.handle_credit_plan_payment();
