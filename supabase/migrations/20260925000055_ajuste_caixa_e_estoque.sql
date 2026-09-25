-- Pente fino: quatro buracos encontrados varrendo as regras de dinheiro.
--
-- 1) stock_adjust aceitava qualquer coisa de qualquer um.
--    Sem permissão (a chave 'stock.adjust' existia e ninguém consultava), sem
--    motivo, sem conferir saldo — e, o pior, sem registrar linha em
--    stock_adjustments. Dava para tirar 9.999 unidades de um produto que tem
--    29 e o estoque ia para -9.971 sem rastro nenhum. É exatamente assim que
--    se encobre furto de mercadoria.
--
-- 2) cash_close aceitava dinheiro contado negativo.
--    Fechei um caixa com "-500 em espécie" e ele gravou diferença de
--    -11.559,50. Gaveta não tem valor negativo: ou é erro de digitação, ou é
--    alguém tentando esconder falta.
--
-- 3) app.external_ordem estava sem search_path fixo.
--
-- 4) create_company ficou com duas versões depois que passou a registrar quem
--    indicou a loja. A versão antiga continuava chamável e engolia a indicação
--    em silêncio — comissão de representante perdida sem ninguém perceber.

-- ---------- 1. ajuste de estoque ----------
create or replace function public.stock_adjust(
  p_store uuid, p_product uuid, p_variant uuid, p_qty numeric,
  p_type public.stock_move_type, p_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid;
  v_saldo   numeric;
  v_custo   numeric;
  v_nome    text;
begin
  select company_id into v_company from public.stores where id = p_store;
  if v_company is null then
    raise exception 'Loja não encontrada';
  end if;
  if not app.has_permission('stock.adjust', p_store) then
    raise exception 'Você não tem permissão para ajustar estoque nesta loja';
  end if;
  if coalesce(p_qty, 0) = 0 then
    raise exception 'Informe a quantidade do ajuste';
  end if;
  if length(coalesce(trim(p_reason), '')) < 5 then
    raise exception 'Ajuste de estoque exige motivo escrito — é o que explica a diferença depois';
  end if;

  select name, coalesce(nullif(avg_cost, 0), cost, 0) into v_nome, v_custo
    from public.products where id = p_product and company_id = v_company;
  if v_nome is null then
    raise exception 'Produto não encontrado';
  end if;

  select coalesce(qty, 0) into v_saldo
    from public.stock_items
   where store_id = p_store and product_id = p_product
     and variant_id is not distinct from p_variant
     for update;

  if p_qty < 0 and coalesce(v_saldo, 0) + p_qty < 0 then
    raise exception 'Ajuste maior que o estoque de %: há % e você está tirando %',
      v_nome, trim(to_char(coalesce(v_saldo, 0), 'FM999990.###')),
      trim(to_char(abs(p_qty), 'FM999990.###'));
  end if;

  insert into public.stock_items (store_id, product_id, variant_id, qty)
  values (p_store, p_product, p_variant, p_qty)
  on conflict (store_id, product_id, variant_id) do update
    set qty = public.stock_items.qty + excluded.qty;

  insert into public.stock_movements
    (company_id, store_id, product_id, variant_id, type, qty, unit_cost, reason, user_id)
  values
    (v_company, p_store, p_product, p_variant, p_type, p_qty, v_custo, trim(p_reason), auth.uid());

  -- o ajuste vira documento próprio: é o que o dono revisa depois
  insert into public.stock_adjustments
    (company_id, store_id, product_id, variant_id, type, qty, reason,
     value_impact, created_by)
  values
    (v_company, p_store, p_product, p_variant, p_type, p_qty, trim(p_reason),
     round(p_qty * v_custo, 2), auth.uid());
end;
$$;

revoke all on function public.stock_adjust(uuid, uuid, uuid, numeric, public.stock_move_type, text)
  from public, anon;
grant execute on function public.stock_adjust(uuid, uuid, uuid, numeric, public.stock_move_type, text)
  to authenticated;

-- ---------- 2. fechamento de caixa ----------
create or replace function public.cash_close(
  p_session uuid, p_counted jsonb, p_justification text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sessao   record;
  v_expected jsonb;
  v_diff     numeric;
  v_contado  numeric;
  v_chave    text;
begin
  select * into v_sessao from public.cash_sessions where id = p_session and status = 'open';
  if not found then
    raise exception 'Caixa não está aberto';
  end if;
  if v_sessao.opened_by is distinct from auth.uid() and not app.is_admin() then
    raise exception 'Só quem abriu o caixa, ou o gerente, pode fechar';
  end if;

  if p_counted is null or jsonb_typeof(p_counted) <> 'object' or not (p_counted ? 'cash') then
    raise exception 'Informe quanto foi contado em dinheiro na gaveta';
  end if;

  -- gaveta não tem valor negativo
  for v_chave in select jsonb_object_keys(p_counted) loop
    if coalesce((p_counted ->> v_chave)::numeric, 0) < 0 then
      raise exception 'Valor contado não pode ser negativo (%)', v_chave;
    end if;
  end loop;

  v_contado  := (p_counted ->> 'cash')::numeric;
  v_expected := public.cash_expected(p_session);
  v_diff     := v_contado - (v_expected ->> 'cash')::numeric;

  update public.cash_sessions
     set status = 'closed', expected = v_expected, counted = p_counted,
         difference = v_diff, justification = p_justification,
         closed_at = now(), closed_by = auth.uid()
   where id = p_session;

  return jsonb_build_object('expected', v_expected, 'difference', v_diff);
end;
$$;

revoke all on function public.cash_close(uuid, jsonb, text) from public, anon;
grant execute on function public.cash_close(uuid, jsonb, text) to authenticated;

-- ---------- 3. search_path da ordem das etapas ----------
create or replace function app.external_ordem(p public.external_status)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'sent' then 0 when 'in_analysis' then 1 when 'quoted' then 2
    when 'approved' then 3 when 'in_repair' then 4 when 'returning' then 5
    when 'received' then 6 end
$$;

-- ---------- 4. versão antiga de create_company ----------
drop function if exists public.create_company(text, text);
