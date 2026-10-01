-- A assinatura encontra a loja, e a loja vencida para de lançar
--
-- Até aqui o webhook recebia o aviso de pagamento e não tinha a quem aplicar:
-- `subscriptions.mp_preapproval_id` nascia vazio e nada preenchia. O lojista
-- pagava e o sistema não sabia.
--
-- O elo é a referência externa. Quando o lojista clica em assinar, o link do
-- Mercado Pago leva o id da empresa; o aviso volta com ele, e é aí que a
-- assinatura encontra a loja.
--
-- A trava segue a decisão de 30/09: cinco dias de carência e depois
-- só-leitura. Em vez de espalhar a checagem por dezenas de funções, ela mora
-- em gatilhos nas tabelas que registram movimento. Gatilho pega tudo — o que
-- entra pela função e o que entra direto pela API —, e é uma lista que dá
-- para ler de uma vez e conferir.

-- ---------- 1. a loja precisa ver o próprio plano ----------
-- saas_plans e subscriptions eram visíveis só para a equipe Avant Cell. O
-- lojista precisa ver os planos para escolher, e a própria assinatura para
-- saber o que está pagando e quando vence. O que ele não pode é ver a de
-- outra loja, nem escrever.
drop policy if exists planos_visiveis on public.saas_plans;
create policy planos_visiveis on public.saas_plans
  for select to authenticated using (active);

drop policy if exists assinatura_da_propria_loja on public.subscriptions;
create policy assinatura_da_propria_loja on public.subscriptions
  for select to authenticated using (company_id = app.current_company_id());

-- ---------- 2. quem está vencida não lança mais nada ----------
create or replace function app.bloqueia_vencida()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v jsonb;
begin
  /* sem empresa no contexto é o webhook ou uma rotina de manutenção rodando
     com a chave de serviço: não há loja para bloquear */
  if app.current_company_id() is null then
    return new;
  end if;

  v := app.assinatura();
  if not (v ->> 'escreve')::boolean then
    raise exception '%', v ->> 'texto' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  /* o que é "lançar": venda, serviço, dinheiro e estoque. Consultar, imprimir
     e exportar continuam livres — a loja nunca perde o proprio historico. */
  foreach t in array array[
    'sales', 'service_orders', 'cash_sessions', 'cash_movements',
    'stock_movements', 'stock_adjustments', 'stock_entries', 'transfers',
    'inventories', 'reservations', 'trade_ins', 'purchase_orders',
    'payables', 'receivables'
  ] loop
    execute format('drop trigger if exists trg_bloqueia_vencida on public.%I', t);
    execute format(
      'create trigger trg_bloqueia_vencida before insert on public.%I
         for each row execute function app.bloqueia_vencida()', t);
  end loop;
end $$;

-- ---------- 3. a carência vira só-leitura sozinha ----------
-- Chamada pela rotina diária. Sem ela a loja ficaria em past_due para sempre,
-- que é o estado que ainda deixa operar.
create or replace function public.assinaturas_vencer_carencia()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_qtd int;
begin
  update public.subscriptions
     set status = 'read_only', updated_at = now()
   where status = 'past_due'
     and grace_until is not null
     and grace_until < current_date;
  get diagnostics v_qtd = row_count;
  return jsonb_build_object('viraram_somente_leitura', v_qtd);
end;
$$;

revoke execute on function public.assinaturas_vencer_carencia() from public, authenticated;
