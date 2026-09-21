-- Devolução: dinheiro de volta só até o que entrou em dinheiro.
--
-- Encontrado na revisão: uma venda paga com crédito na loja podia ser
-- devolvida em dinheiro. Na prática isso transforma crédito em saque — quem
-- tivesse saldo poderia comprar e devolver para levar dinheiro vivo. A trava
-- de caixa só barrava quando faltava dinheiro na gaveta.
--
-- Agora o reembolso em dinheiro, Pix ou estorno é limitado ao que o cliente
-- realmente pagou em dinheiro/cartão naquela venda, descontado o que já foi
-- devolvido assim. O restante volta como crédito na loja.
--
-- No mesmo passo: aparelho com IMEI volta inteiro, nunca em fração.

create or replace function public.return_sale(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sale     record;
  v_item     record;
  v_ret      uuid;
  v_credit   uuid;
  v_total    numeric := 0;
  v_qty      numeric;
  v_val      numeric;
  v_restante numeric;
  v_track    boolean;
  v_caixa    numeric;
  v_dinheiro numeric;
  v_devolvido numeric;
  v_dest     public.return_destination;
  v_kind     public.payment_kind := (p ->> 'refund_kind')::public.payment_kind;
  v_session  uuid := nullif(p ->> 'cash_session_id', '')::uuid;
  it         jsonb;
begin
  select id, company_id, store_id, status, customer_id into v_sale
    from public.sales where id = (p ->> 'sale_id')::uuid
     for update;
  if not found then
    raise exception 'Venda não encontrada';
  end if;
  if v_sale.status not in ('completed', 'partially_returned') then
    raise exception 'Esta venda não pode ser devolvida (situação: %)', v_sale.status;
  end if;
  if not app.has_permission('sales.return', v_sale.store_id) then
    raise exception 'Você não tem permissão para fazer devolução ou troca';
  end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Selecione ao menos um item para devolver';
  end if;
  if v_kind = 'store_credit' and v_sale.customer_id is null then
    raise exception 'Crédito na loja exige cliente identificado na venda original';
  end if;
  if v_kind = 'cash' then
    perform 1 from public.cash_sessions
     where id = v_session and store_id = v_sale.store_id and status = 'open';
    if not found then
      raise exception 'Abra o caixa para devolver o dinheiro';
    end if;
  end if;

  -- O que o cliente pagou com crédito na loja não pode voltar como dinheiro,
  -- senão o crédito vira saque. Só volta em dinheiro (ou estorno) até o que
  -- entrou em dinheiro, Pix ou cartão nesta venda, descontado o que já foi
  -- devolvido assim.
  if v_kind not in ('store_credit', 'voucher') then
    select coalesce(sum(case when kind in ('store_credit', 'voucher') then 0
                             else amount - coalesce(change_given, 0) end), 0)
      into v_dinheiro
      from public.sale_payments where sale_id = v_sale.id;

    select coalesce(sum(total), 0) into v_devolvido
      from public.sale_returns
     where sale_id = v_sale.id and refund_kind not in ('store_credit', 'voucher');
  end if;

  insert into public.sale_returns
    (company_id, store_id, sale_id, reason, refund_kind, total, notes, created_by)
  values
    (v_sale.company_id, v_sale.store_id, v_sale.id,
     (p ->> 'reason')::public.return_reason, v_kind, 0,
     nullif(p ->> 'notes', ''), auth.uid())
  returning id into v_ret;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty  := (it ->> 'qty')::numeric;
    v_dest := coalesce(nullif(it ->> 'destination', ''), 'stock')::public.return_destination;

    select si.id, si.product_id, si.variant_id, si.unit_id, si.qty,
           coalesce(si.returned_qty, 0) as returned_qty, si.total, si.unit_cost
      into v_item
      from public.sale_items si
     where si.id = (it ->> 'sale_item_id')::uuid and si.sale_id = v_sale.id
       for update;
    if not found then
      raise exception 'Item não pertence a esta venda';
    end if;
    if v_qty <= 0 or v_qty > v_item.qty - v_item.returned_qty then
      raise exception 'Quantidade a devolver inválida (restam % deste item)', v_item.qty - v_item.returned_qty;
    end if;
    if v_item.unit_id is not null and v_qty <> 1 then
      raise exception 'Aparelho com IMEI volta inteiro, não em partes';
    end if;

    v_val   := round(v_item.total / v_item.qty * v_qty, 2);
    v_total := v_total + v_val;

    update public.sale_items set returned_qty = coalesce(returned_qty, 0) + v_qty where id = v_item.id;
    insert into public.sale_return_items (return_id, sale_item_id, qty, destination)
    values (v_ret, v_item.id, v_qty, v_dest);

    if v_item.unit_id is not null then
      update public.serialized_units
         set status = (case v_dest
                         when 'stock'  then 'available'
                         when 'damage' then 'damaged'
                         when 'os'     then 'in_service'
                         else 'returned' end)::public.unit_status,
             updated_at = now()
       where id = v_item.unit_id;
      insert into public.stock_movements
        (company_id, store_id, product_id, variant_id, unit_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
      values
        (v_sale.company_id, v_sale.store_id, v_item.product_id, v_item.variant_id, v_item.unit_id,
         'sale_return_in', 1, v_item.unit_cost, 'sale_returns', v_ret, v_dest::text, auth.uid());
    else
      select track_stock into v_track from public.products where id = v_item.product_id;
      if v_track then
        insert into public.stock_movements
          (company_id, store_id, product_id, variant_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
        values
          (v_sale.company_id, v_sale.store_id, v_item.product_id, v_item.variant_id,
           'sale_return_in', v_qty, v_item.unit_cost, 'sale_returns', v_ret, v_dest::text, auth.uid());
        if v_dest = 'stock' then
          insert into public.stock_items (store_id, product_id, variant_id, qty)
          values (v_sale.store_id, v_item.product_id, v_item.variant_id, v_qty)
          on conflict (store_id, product_id, variant_id) do update
            set qty = public.stock_items.qty + v_qty;
        else
          insert into public.stock_movements
            (company_id, store_id, product_id, variant_id, type, qty, unit_cost, ref_table, ref_id, reason, user_id)
          values
            (v_sale.company_id, v_sale.store_id, v_item.product_id, v_item.variant_id,
             'breakage', -v_qty, v_item.unit_cost, 'sale_returns', v_ret, v_dest::text, auth.uid());
        end if;
      end if;
    end if;
  end loop;

  update public.sale_returns set total = v_total where id = v_ret;

  if v_kind not in ('store_credit', 'voucher')
     and v_total > coalesce(v_dinheiro, 0) - coalesce(v_devolvido, 0) + 0.005 then
    raise exception 'Esta venda foi paga com crédito na loja. Em dinheiro ou estorno só é possível devolver R$ %; o restante deve voltar como crédito.',
      round(greatest(coalesce(v_dinheiro, 0) - coalesce(v_devolvido, 0), 0), 2);
  end if;

  if v_kind = 'store_credit' then
    v_credit := app.credit_add(v_sale.company_id, v_sale.store_id, v_sale.customer_id, v_total, 'return', v_ret);
  elsif v_kind = 'cash' then
    v_caixa := app.cash_disponivel(v_session);
    if v_total > v_caixa then
      raise exception 'O caixa tem R$ % e a devolução é de R$ %. Faça um suprimento ou devolva de outra forma.', v_caixa, v_total;
    end if;
    insert into public.cash_movements (session_id, store_id, type, amount, ref_id, user_id)
    values (v_session, v_sale.store_id, 'refund', v_total, v_ret, auth.uid());
  end if;

  select coalesce(sum(qty - coalesce(returned_qty, 0)), 0) into v_restante
    from public.sale_items where sale_id = v_sale.id;
  update public.sales
     set status = (case when v_restante <= 0 then 'returned' else 'partially_returned' end)::public.sale_status
   where id = v_sale.id;

  return jsonb_build_object('return_id', v_ret, 'total', v_total, 'credit_id', v_credit);
end;
$$;


revoke all on function public.return_sale(jsonb) from public, anon;
grant execute on function public.return_sale(jsonb) to authenticated;
