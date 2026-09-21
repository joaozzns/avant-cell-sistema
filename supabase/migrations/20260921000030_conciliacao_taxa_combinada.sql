-- Conciliação de cartão: não sobrescrever a taxa combinada.
--
-- Encontrado no teste: ao conciliar, o sistema gravava no pagamento da venda a
-- taxa que a maquininha cobrou, por cima da taxa combinada. Com isso a prova
-- do que foi acertado sumia, e uma conferência futura do mesmo pagamento
-- passaria a comparar a cobrança com ela mesma — aceitando em silêncio uma
-- taxa maior que a contratada.
--
-- Agora só o líquido recebido volta para o pagamento. A taxa realmente cobrada
-- continua registrada no extrato importado.

create or replace function public.card_reconcile(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company   uuid := app.current_company_id();
  v_store     uuid := nullif(p ->> 'store_id', '')::uuid;
  v_lote      text := nullif(p ->> 'import_batch', '');
  v_s         record;
  v_pag       record;
  v_taxa_esp  numeric;
  v_casados   int := 0;
  v_diverg    int := 0;
  v_sobra     int := 0;
begin
  if v_company is null then
    raise exception 'Empresa não identificada';
  end if;
  if not app.has_permission('finance.reconcile', v_store) then
    raise exception 'Você não tem permissão para conciliar cartões';
  end if;

  for v_s in
    select * from public.card_settlements
     where company_id = v_company
       and status = 'pending'
       and (v_lote is null or import_batch = v_lote)
     order by expected_date, gross
  loop
    v_pag := null;

    -- 1) pelo código de autorização
    if nullif(v_s.raw ->> 'auth_code', '') is not null then
      select sp.* into v_pag
        from public.sale_payments sp
        join public.sales sa on sa.id = sp.sale_id
       where sa.company_id = v_company
         and sp.auth_code = (v_s.raw ->> 'auth_code')
         and sp.kind in ('debit', 'credit', 'credit_installments')
         and not exists (select 1 from public.card_settlements c
                          where c.sale_payment_id = sp.id and c.id <> v_s.id)
       limit 1;
    end if;

    -- 2) pelo valor bruto, com data próxima
    if v_pag is null then
      select sp.* into v_pag
        from public.sale_payments sp
        join public.sales sa on sa.id = sp.sale_id
       where sa.company_id = v_company
         and (v_store is null or sa.store_id = v_store)
         and sp.kind in ('debit', 'credit', 'credit_installments')
         and round(sp.amount, 2) = round(v_s.gross, 2)
         and (v_s.expected_date is null
              or sa.completed_at::date between v_s.expected_date - 40 and v_s.expected_date + 2)
         and not exists (select 1 from public.card_settlements c
                          where c.sale_payment_id = sp.id and c.id <> v_s.id)
       order by abs(sa.completed_at::date - coalesce(v_s.expected_date, sa.completed_at::date))
       limit 1;
    end if;

    if v_pag is null then
      v_sobra := v_sobra + 1;
      continue;
    end if;

    -- taxa combinada: a do pagamento, ou a da forma de pagamento cadastrada
    v_taxa_esp := coalesce(nullif(v_pag.fee_percent, 0),
                           (select fee_percent from public.payment_methods
                             where id = v_pag.method_id), 0);

    update public.card_settlements
       set sale_payment_id = v_pag.id,
           status = (case
                       when v_taxa_esp > 0
                        and abs(round(v_s.gross * v_taxa_esp / 100, 2) - v_s.fee) > 0.05
                       then 'divergent' else 'matched' end)::public.settlement_status
     where id = v_s.id;

    if v_taxa_esp > 0 and abs(round(v_s.gross * v_taxa_esp / 100, 2) - v_s.fee) > 0.05 then
      v_diverg := v_diverg + 1;
    else
      v_casados := v_casados + 1;
    end if;

    -- guarda só o líquido que entrou de verdade. A taxa combinada continua
    -- como está: ela é a prova do que foi acertado, e a taxa realmente
    -- cobrada fica no próprio extrato (fee / gross).
    update public.sale_payments
       set net_amount = v_s.net
     where id = v_pag.id;
  end loop;

  return jsonb_build_object('casados', v_casados, 'divergentes', v_diverg, 'sem_par', v_sobra);
end;
$$;

revoke all on function public.card_reconcile(jsonb) from public, anon;
grant execute on function public.card_reconcile(jsonb) to authenticated;
