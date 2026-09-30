-- A entrega de OS tinha os mesmos buracos da venda, e ninguém tinha olhado
--
-- Sondagem de 30/09/2026, numa OS de R$ 100 de taxa de diagnóstico:
--
--   • pagamento em dinheiro de R$ 1.000 com um pix de -R$ 900: a soma fecha
--     com os R$ 100, mas entraram R$ 1.000 na gaveta. É o mesmo buraco que a
--     venda tinha (migração 057) — o `complete_sale` foi corrigido, o
--     `deliver_os` ficou para trás com a própria cópia do laço de pagamentos.
--   • troco de R$ 50 num pagamento em pix: o dinheiro sai da gaveta e nenhum
--     movimento de caixa registra a saída.
--
-- A função também não verificava permissão nenhuma: qualquer usuário da
-- empresa entregava aparelho e recebia por ele. Existe `os.deliver` desde o
-- primeiro dia, e é o que gerente e técnico já têm.
--
-- E os itens da venda nasciam com custo zero, então toda OS entregue aparecia
-- com 100% de margem no relatório. O custo da peça mora no produto; a mão de
-- obra é que não tem custo de mercadoria.

create or replace function public.deliver_os(p jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_os record; v_quote record; v_session uuid; v_company uuid;
  v_sale uuid; v_number bigint; v_total numeric := 0; v_paid numeric := 0;
  v_cash_in numeric := 0;
  it record; pay jsonb; v_labor_product uuid;
  v_valor numeric; v_troco numeric; v_custo numeric;
begin
  select * into v_os from public.service_orders
   where id = (p ->> 'os_id')::uuid for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if v_os.status not in ('ready','unrepaired') then
    raise exception 'OS precisa estar Pronta (ou Sem reparo) para entrega';
  end if;
  v_company := v_os.company_id;

  if not app.has_permission('os.deliver', v_os.store_id) then
    raise exception 'Você não tem permissão para entregar aparelho';
  end if;

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
    v_total := coalesce(v_os.diagnosis_fee, 0);
  end if;

  /* cada pagamento precisa ser um pagamento de verdade: com valor negativo a
     soma continuava fechando com o total enquanto a gaveta recebia outro
     valor, e troco fora do dinheiro tirava da gaveta sem deixar movimento */
  for pay in select * from jsonb_array_elements(coalesce(p -> 'payments', '[]'::jsonb)) loop
    v_valor := (pay ->> 'amount')::numeric;
    v_troco := coalesce((pay ->> 'change_given')::numeric, 0);

    if v_valor is null or v_valor <= 0 then
      raise exception 'Valor de pagamento inválido: todo pagamento entra com valor maior que zero';
    end if;
    if v_troco < 0 then
      raise exception 'Troco não pode ser negativo';
    end if;
    if v_troco > 0 and (pay ->> 'kind') <> 'cash' then
      raise exception 'Só há troco em pagamento em dinheiro';
    end if;
    if v_troco > v_valor then
      raise exception 'Troco maior que o valor recebido';
    end if;

    v_paid := v_paid + v_valor - v_troco;
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
        select qi.*, pr.id as prod_id,
               coalesce(nullif(pr.avg_cost, 0), pr.cost, 0) as custo
          from public.os_quote_items qi
          left join public.products pr on pr.id = qi.product_id
         where qi.quote_id = v_quote.id and coalesce(qi.approved, true)
      loop
        /* peça tem custo; mão de obra não tem custo de mercadoria */
        v_custo := case when it.prod_id is null then 0 else coalesce(it.custo, 0) end;
        insert into public.sale_items
          (sale_id, product_id, qty, unit_price, unit_cost, total, note)
        values
          (v_sale, coalesce(it.prod_id, v_labor_product), it.qty, it.unit_price,
           v_custo, it.qty * it.unit_price, it.description);
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
