-- Dinheiro escrito como o lojista lê.
--
-- Os alertas estavam mostrando "3,200.00" porque o to_char do Postgres segue a
-- configuração do servidor, que usa ponto decimal. No meio de uma frase em
-- português isso parece erro de sistema — e quem lê "486.70" pode entender
-- quatrocentos e oitenta e seis reais ou quarenta e oito mil.

create or replace function app.brl(p numeric)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select 'R$ ' || replace(replace(replace(
           to_char(coalesce(p, 0), 'FM999,999,990.00'),
         ',', '|'), '.', ','), '|', '.')
$fn$;

revoke all on function app.brl(numeric) from public, anon;
grant execute on function app.brl(numeric) to authenticated;

create or replace function public.alerts_refresh(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid := app.current_company_id();
  v_store   uuid := nullif(p ->> 'store_id', '')::uuid;
  v_agora   timestamptz := now();
  v_novos   int := 0;
  v_fechados int := 0;
begin
  if v_company is null then
    raise exception 'Empresa não identificada';
  end if;

  -- tabela temporária com a fotografia do que está errado agora
  create temp table _achados (
    kind text, severity text, title text, body text,
    ref_table text, ref_id uuid, store_id uuid
  ) on commit drop;

  -- ---------- estoque abaixo do mínimo ----------
  insert into _achados
  select 'low_stock', 'warning',
         pr.name || ': ' || trim(to_char(si.qty, 'FM999990.###')) || ' em estoque',
         'O mínimo definido é ' || trim(to_char(si.min_qty, 'FM999990.###')) || '. Reponha antes de perder venda.',
         'stock_items', si.id, si.store_id
    from public.stock_items si
    join public.products pr on pr.id = si.product_id
    join public.stores st on st.id = si.store_id
   where st.company_id = v_company
     and (v_store is null or si.store_id = v_store)
     and si.min_qty > 0 and si.qty <= si.min_qty
     and pr.active;

  -- ---------- OS parada esperando aprovação ----------
  insert into _achados
  select 'os_awaiting_48h', 'warning',
         'OS #' || o.number || ' esperando aprovação há ' ||
           extract(day from v_agora - o.updated_at)::int || ' dia(s)',
         'Orçamento enviado e sem resposta. Ligue para o cliente antes que ele desista.',
         'service_orders', o.id, o.store_id
    from public.service_orders o
   where o.company_id = v_company
     and (v_store is null or o.store_id = v_store)
     and o.status = 'awaiting_approval'
     and o.updated_at < v_agora - interval '48 hours';

  -- ---------- aparelho pronto e não retirado ----------
  insert into _achados
  select 'not_picked_up',
         case when o.updated_at < v_agora - interval '30 days' then 'critical' else 'warning' end,
         'OS #' || o.number || ' pronta há ' ||
           extract(day from v_agora - o.updated_at)::int || ' dia(s) sem retirada',
         'Aparelho ocupando prateleira e risco de abandono. Registre a tentativa de contato.',
         'service_orders', o.id, o.store_id
    from public.service_orders o
   where o.company_id = v_company
     and (v_store is null or o.store_id = v_store)
     and o.status = 'ready'
     and o.updated_at < v_agora - interval '7 days';

  -- ---------- nota fiscal rejeitada ----------
  insert into _achados
  select 'fiscal_rejected', 'critical',
         upper(f.kind::text) || ' nº ' || coalesce(f.number::text, '—') || ' rejeitada',
         coalesce(f.rejection_reason, 'Sem motivo informado pelo gateway.'),
         'fiscal_documents', f.id, f.store_id
    from public.fiscal_documents f
   where f.company_id = v_company
     and (v_store is null or f.store_id = v_store)
     and f.status = 'rejected';

  -- ---------- maquininha cobrando diferente do combinado ----------
  insert into _achados
  select 'unreconciled', 'critical',
         c.acquirer || ': taxa diferente da combinada',
         'Bruto de ' || app.brl(c.gross) || ' com ' ||
           app.brl(c.fee) || ' de taxa. Confira o contrato.',
         'card_settlements', c.id, c.store_id
    from public.card_settlements c
   where c.company_id = v_company
     and (v_store is null or c.store_id = v_store)
     and c.status = 'divergent';

  -- ---------- conta vencida ----------
  insert into _achados
  select 'overdue_bill',
         case when pa.due_date < current_date - 7 then 'critical' else 'warning' end,
         pa.description || ' venceu em ' || to_char(pa.due_date, 'DD/MM'),
         'Valor em aberto: ' || app.brl(pa.amount - coalesce(pa.paid_amount, 0)) || '.',
         'payables', pa.id, pa.store_id
    from public.payables pa
   where pa.company_id = v_company
     and (v_store is null or pa.store_id is null or pa.store_id = v_store)
     and pa.status in ('open', 'partial')
     and pa.due_date < current_date;

  -- ---------- crediário atrasado ----------
  insert into _achados
  select 'overdue_bill', 'warning',
         'Crediário atrasado: ' || coalesce(cu.name, 'cliente sem nome'),
         r.description || ' venceu em ' || to_char(r.due_date, 'DD/MM') || ' · ' ||
           app.brl(r.amount - coalesce(r.paid_amount, 0)),
         'receivables', r.id, r.store_id
    from public.receivables r
    left join public.customers cu on cu.id = r.customer_id
   where r.company_id = v_company
     and (v_store is null or r.store_id = v_store)
     and r.status in ('open', 'partial')
     and r.due_date < current_date;

  -- ---------- inventário com divergência ----------
  insert into _achados
  select 'inventory_divergence', 'warning',
         'Inventário de ' || to_char(i.closed_at, 'DD/MM') || ' fechou com diferença',
         'Diferença apurada: ' || app.brl(d.total) || '. Vale entender de onde veio.',
         'inventories', i.id, i.store_id
    from public.inventories i
    join lateral (
      select coalesce(sum(abs(ii.diff_value)), 0) as total
        from public.inventory_items ii where ii.inventory_id = i.id
    ) d on true
   where i.company_id = v_company
     and (v_store is null or i.store_id = v_store)
     and i.status = 'closed'
     and i.closed_at > v_agora - interval '60 days'
     and d.total > 0;

  -- ---------- certificado digital vencendo ----------
  insert into _achados
  select 'certificate_expiring',
         case when fs.certificate_expires_at <= current_date then 'critical' else 'warning' end,
         case when fs.certificate_expires_at <= current_date
              then 'Certificado digital vencido'
              else 'Certificado digital vence em ' ||
                   (fs.certificate_expires_at - current_date) || ' dia(s)' end,
         'Sem certificado válido a loja para de emitir nota.',
         'fiscal_settings', fs.id, fs.store_id
    from public.fiscal_settings fs
   where fs.company_id = v_company
     and fs.certificate_expires_at is not null
     and fs.certificate_expires_at <= current_date + 30;

  -- ---------- atualiza o que já existia ----------
  update public.alerts a
     set title = f.title, body = f.body, severity = f.severity
    from _achados f
   where a.company_id = v_company
     and a.kind = f.kind
     and a.ref_id is not distinct from f.ref_id
     and a.status in ('open', 'snoozed');

  -- ---------- cria os novos ----------
  insert into public.alerts (company_id, store_id, kind, severity, title, body, ref_table, ref_id)
  select v_company, f.store_id, f.kind, f.severity, f.title, f.body, f.ref_table, f.ref_id
    from _achados f
   where not exists (
     select 1 from public.alerts a
      where a.company_id = v_company and a.kind = f.kind
        and a.ref_id is not distinct from f.ref_id
        and a.status in ('open', 'snoozed'));
  get diagnostics v_novos = row_count;

  -- ---------- resolve o que deixou de ser problema ----------
  update public.alerts a
     set status = 'resolved', resolved_at = v_agora
   where a.company_id = v_company
     and a.status in ('open', 'snoozed')
     and (v_store is null or a.store_id is not distinct from v_store)
     and not exists (
       select 1 from _achados f
        where f.kind = a.kind and f.ref_id is not distinct from a.ref_id);
  get diagnostics v_fechados = row_count;

  -- adiamento vencido volta a aparecer
  update public.alerts
     set status = 'open', snooze_until = null
   where company_id = v_company and status = 'snoozed'
     and snooze_until is not null and snooze_until <= v_agora;

  return jsonb_build_object('novos', v_novos, 'resolvidos', v_fechados);
end;
$$;

revoke all on function public.alerts_refresh(jsonb) from public, anon;
grant execute on function public.alerts_refresh(jsonb) to authenticated;
