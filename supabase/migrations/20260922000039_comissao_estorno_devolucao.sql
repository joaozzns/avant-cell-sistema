-- Estorno de comissão quando a venda volta.
--
-- A apuração do mês já desconta item devolvido da base — mas só mexe no que
-- ainda está "a apurar". Comissão aprovada ou paga nunca era tocada: venda de
-- setembro paga dia 5, cliente devolve dia 10, e o vendedor ficou com a
-- comissão de uma venda que voltou para a prateleira. Em loja de celular, onde
-- a comissão de um aparelho passa de cem reais, isso vira dinheiro rápido.
--
-- Agora toda devolução gera um lançamento negativo, no mês corrente, ligado ao
-- lançamento original. O vendedor vê o estorno com nome e motivo, e o valor
-- entra no próximo pagamento — ninguém apaga histórico de comissão paga.

alter table public.commission_entries
  add column if not exists reversal_of uuid references public.commission_entries(id),
  add column if not exists notes text;

create index if not exists idx_commission_reversal
  on public.commission_entries (reversal_of) where reversal_of is not null;

-- ---------- gera o estorno a cada item devolvido ----------
create or replace function app.commission_on_return()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item     record;
  v_lanc     record;
  v_ja       numeric;
  v_prop     numeric;
  v_valor    numeric;
  v_base     numeric;
  v_periodo  text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  select si.id, si.qty, si.sale_id into v_item
    from public.sale_items si where si.id = new.sale_item_id;
  if not found or coalesce(v_item.qty, 0) <= 0 then
    return new;
  end if;

  v_prop := least(new.qty / v_item.qty, 1);

  for v_lanc in
    select * from public.commission_entries
     where sale_item_id = v_item.id
       and amount > 0
       and status in ('approved', 'paid')   -- 'accrued' a própria apuração refaz
  loop
    -- nunca estorna mais do que a comissão daquele lançamento
    select coalesce(sum(-amount), 0) into v_ja
      from public.commission_entries where reversal_of = v_lanc.id;

    v_valor := least(round(v_lanc.amount * v_prop, 2), v_lanc.amount - v_ja);
    if v_valor <= 0 then
      continue;
    end if;
    v_base := round(v_lanc.base_amount * v_prop, 2);

    insert into public.commission_entries
      (company_id, store_id, user_id, rule_id, sale_id, sale_item_id,
       base_amount, amount, period, status, reversal_of, notes)
    values
      (v_lanc.company_id, v_lanc.store_id, v_lanc.user_id, v_lanc.rule_id,
       v_lanc.sale_id, v_lanc.sale_item_id,
       -v_base, -v_valor, v_periodo, 'accrued', v_lanc.id,
       'Estorno: item devolvido em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_comissao_estorno on public.sale_return_items;
create trigger trg_comissao_estorno
  after insert on public.sale_return_items
  for each row execute function app.commission_on_return();

-- ---------- a apuração não pode apagar os estornos ----------
-- (ela refaz o que está "a apurar"; estorno não é apuração, é acerto de conta)
create or replace function public.commission_accrue(p_period text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company   uuid := app.current_company_id();
  v_ini       date;
  v_fim       date;
  v_regra     record;
  v_item      record;
  v_os        record;
  v_base      numeric;
  v_valor     numeric;
  v_pago      numeric;
  v_total     numeric;
  v_prop      numeric;
  v_qtd       int := 0;
  v_soma      numeric := 0;
begin
  if v_company is null then
    raise exception 'Empresa não identificada';
  end if;
  if p_period !~ '^\d{4}-\d{2}$' then
    raise exception 'Período inválido (use AAAA-MM)';
  end if;
  if not app.is_admin() then
    raise exception 'Só o dono ou gerente pode apurar comissão';
  end if;

  v_ini := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_fim := (v_ini + interval '1 month')::date;

  -- refaz apenas o que ainda está em aberto, preservando os estornos
  delete from public.commission_entries
   where company_id = v_company and period = p_period
     and status = 'accrued' and reversal_of is null;

  for v_regra in
    select * from public.commission_rules
     where company_id = v_company and active
     order by base
  loop
    if v_regra.base in ('sale', 'margin') and coalesce(v_regra.rate, 0) > 0 then
      for v_item in
        select si.id as item_id, si.sale_id, si.qty, coalesce(si.returned_qty, 0) as devolvido,
               si.total, si.unit_cost, s.store_id, s.seller_id, s.total as venda_total,
               p.category_id, si.product_id
          from public.sale_items si
          join public.sales s on s.id = si.sale_id
          join public.products p on p.id = si.product_id
         where s.company_id = v_company
           and s.status in ('completed', 'partially_returned')
           and s.completed_at >= v_ini and s.completed_at < v_fim
           and s.seller_id is not null
      loop
        if v_regra.scope ? 'product_id'
           and (v_regra.scope ->> 'product_id')::uuid is distinct from v_item.product_id then
          continue;
        end if;
        if v_regra.scope ? 'category_id'
           and (v_regra.scope ->> 'category_id')::uuid is distinct from v_item.category_id then
          continue;
        end if;
        if v_item.qty - v_item.devolvido <= 0 then
          continue;
        end if;

        v_base := round(v_item.total / v_item.qty * (v_item.qty - v_item.devolvido), 2);
        if v_regra.base = 'margin' then
          v_base := v_base - round(coalesce(v_item.unit_cost, 0) * (v_item.qty - v_item.devolvido), 2);
        end if;
        if v_base <= 0 then
          continue;
        end if;

        if v_regra.only_when_paid then
          select coalesce(sum(case when kind = 'credit_plan' then 0
                                   else amount - coalesce(change_given, 0) end), 0),
                 coalesce(sum(amount - coalesce(change_given, 0)), 0)
            into v_pago, v_total
            from public.sale_payments where sale_id = v_item.sale_id;
          v_prop := case when v_total > 0 then least(v_pago / v_total, 1) else 1 end;
          v_base := round(v_base * v_prop, 2);
          if v_base <= 0 then
            continue;
          end if;
        end if;

        v_valor := round(v_base * v_regra.rate / 100, 2);
        if v_valor <= 0 then
          continue;
        end if;

        -- comissão já aprovada ou paga deste item não é recalculada:
        -- o que sobrou dela vira estorno pelo gatilho da devolução
        perform 1 from public.commission_entries
         where sale_item_id = v_item.item_id and status in ('approved', 'paid');
        if found then
          continue;
        end if;

        insert into public.commission_entries
          (company_id, store_id, user_id, rule_id, sale_id, sale_item_id, base_amount, amount, period)
        values
          (v_company, v_item.store_id, v_item.seller_id, v_regra.id, v_item.sale_id, v_item.item_id,
           v_base, v_valor, p_period);
        v_qtd := v_qtd + 1;
        v_soma := v_soma + v_valor;
      end loop;
    end if;

    if v_regra.base = 'fixed_per_os' and coalesce(v_regra.fixed_amount, 0) > 0 then
      for v_os in
        select o.id, o.store_id, o.technician_id, coalesce(o.total, 0) as total
          from public.service_orders o
         where o.company_id = v_company
           and o.status = 'delivered'
           and o.delivered_at >= v_ini and o.delivered_at < v_fim
           and o.technician_id is not null
      loop
        perform 1 from public.commission_entries
         where os_id = v_os.id and status in ('approved', 'paid');
        if found then
          continue;
        end if;

        insert into public.commission_entries
          (company_id, store_id, user_id, rule_id, os_id, base_amount, amount, period)
        values
          (v_company, v_os.store_id, v_os.technician_id, v_regra.id, v_os.id,
           v_os.total, v_regra.fixed_amount, p_period);
        v_qtd := v_qtd + 1;
        v_soma := v_soma + v_regra.fixed_amount;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('period', p_period, 'lancamentos', v_qtd, 'total', v_soma);
end;
$$;

revoke all on function public.commission_accrue(text) from public, anon;
grant execute on function public.commission_accrue(text) to authenticated;
