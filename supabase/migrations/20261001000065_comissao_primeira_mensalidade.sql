-- Comissão do representante: a primeira mensalidade inteira
--
-- Modelo definido em 01/10/2026, e este é o primeiro que corresponde a uma
-- regra de verdade — os três que a migração 050 rascunhou eram hipóteses.
--
--   • plano mensal: o representante ganha a mensalidade inteira
--     (R$ 97, R$ 127 ou R$ 197), uma vez, na primeira cobrança paga;
--   • plano anual: a mesma mensalidade mais 10%, porque a venda anual traz o
--     dinheiro todo na frente — R$ 106,70, R$ 139,70 e R$ 216,70.
--
-- Conta quando o pagamento confirma, não quando a loja assina. Assinatura com
-- cartão recusado não gera dívida com o vendedor.
--
-- Por que uma tabela e não uma conta na hora de exibir: o painel antigo
-- calculava a comissão somando as assinaturas iniciadas no mês corrente. Isso
-- desfaz o passado — se o preço do plano mudar, o que o representante ganhou
-- em março muda junto; e uma assinatura que foi paga e depois cancelada
-- sumiria do cálculo. Comissão é dinheiro devido a alguém: fica registrada
-- com o valor que tinha no dia.

-- ---------- 1. o que foi ganho, e quando ----------
create table if not exists public.partner_earnings (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners(id),
  subscription_id uuid not null unique references public.subscriptions(id),
  company_id      uuid not null references public.companies(id),
  amount          numeric(14,2) not null,
  basis           text not null,          -- como o valor foi formado, em palavras
  earned_at       timestamptz not null default now(),
  paid_at         timestamptz,            -- quando a Avant Cell repassou
  notes           text
);
create index if not exists idx_earnings_parceiro on public.partner_earnings (partner_id, earned_at desc);

alter table public.partner_earnings enable row level security;
drop policy if exists staff_all on public.partner_earnings;
create policy staff_all on public.partner_earnings for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

comment on column public.partner_earnings.subscription_id is
  'Único: uma assinatura gera comissão uma vez só. É esta restrição que '
  'impede o aviso repetido do Mercado Pago de pagar o vendedor duas vezes.';

-- ---------- 2. o modelo, agora de verdade ----------
update public.partner_settings
   set commission_kind = 'first_month_full',
       percent = 10,                      -- o bônus do plano anual
       fixed_amount = null,
       notes = 'Definido em 01/10/2026: primeira mensalidade inteira no plano '
               'mensal; mensalidade + 10% no anual. Conta quando o pagamento confirma.',
       updated_at = now()
 where id;

-- ---------- 3. a comissão nasce do primeiro pagamento ----------
create or replace function app.comissao_da_primeira_cobranca()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_parceiro uuid;
  v_plano    record;
  v_cfg      record;
  v_valor    numeric;
  v_base     text;
begin
  /* só no instante em que o primeiro pagamento confirma */
  if new.last_payment_at is null or old.last_payment_at is not null then
    return new;
  end if;

  v_parceiro := coalesce(new.partner_id,
                         (select referred_by from public.companies where id = new.company_id));
  if v_parceiro is null then
    return new;                            -- loja que chegou sozinha
  end if;

  select * into v_cfg from public.partner_settings where id;
  if v_cfg.commission_kind is distinct from 'first_month_full' then
    return new;                            -- outro modelo em vigor
  end if;

  select * into v_plano from public.saas_plans where id = new.plan_id;
  if v_plano.id is null then
    return new;                            -- sem plano não há de onde tirar o valor
  end if;

  if new.charge_period = 'annual' then
    v_valor := round(v_plano.monthly_price * (1 + coalesce(v_cfg.percent, 0) / 100), 2);
    v_base  := 'Plano anual ' || v_plano.name || ': mensalidade de R$ ' ||
               trim(to_char(v_plano.monthly_price, 'FM999990.00')) || ' mais ' ||
               trim(to_char(coalesce(v_cfg.percent, 0), 'FM999990.##')) || '%';
  else
    v_valor := v_plano.monthly_price;
    v_base  := 'Plano mensal ' || v_plano.name || ': primeira mensalidade inteira';
  end if;

  /* a restrição de unicidade faz o aviso repetido não virar pagamento dobrado */
  insert into public.partner_earnings
    (partner_id, subscription_id, company_id, amount, basis)
  values
    (v_parceiro, new.id, new.company_id, v_valor, v_base)
  on conflict (subscription_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_comissao_primeira_cobranca on public.subscriptions;
create trigger trg_comissao_primeira_cobranca
  after update of last_payment_at on public.subscriptions
  for each row execute function app.comissao_da_primeira_cobranca();

-- ---------- 4. o painel passa a mostrar o que foi ganho ----------
create or replace function public.partner_panel(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_p      record;
  v_cfg    record;
  v_lojas  jsonb;
  v_ativas int;
  v_mrr    numeric;
  v_mes    int;
  v_com    jsonb;
  v_total  numeric;
  v_no_mes numeric;
  v_aberto numeric;
begin
  select * into v_p from public.partners where token = p_token and active;
  if not found then
    return jsonb_build_object('erro', 'link inválido');
  end if;

  select * into v_cfg from public.partner_settings where id;

  select coalesce(sum(s.monthly_amount) filter (where s.status = 'active'), 0),
         count(*) filter (where s.status = 'active'),
         count(*) filter (where s.started_at >= date_trunc('month', current_date))
    into v_mrr, v_ativas, v_mes
    from public.subscriptions s
   where s.partner_id = v_p.id
      or s.company_id in (select id from public.companies where referred_by = v_p.id);

  select coalesce(sum(amount), 0),
         coalesce(sum(amount) filter (where earned_at >= date_trunc('month', current_date)), 0),
         coalesce(sum(amount) filter (where paid_at is null), 0)
    into v_total, v_no_mes, v_aberto
    from public.partner_earnings
   where partner_id = v_p.id;

  select jsonb_agg(jsonb_build_object(
           'loja', c.trade_name, 'nome', c.name, 'plano', pl.name,
           'valor', s.monthly_amount, 'situacao', s.status,
           'desde', s.started_at,
           'comissao', e.amount,
           'comissao_base', e.basis,
           'comissao_paga', e.paid_at is not null) order by s.started_at desc)
    into v_lojas
    from public.subscriptions s
    join public.companies c on c.id = s.company_id
    left join public.saas_plans pl on pl.id = s.plan_id
    left join public.partner_earnings e on e.subscription_id = s.id
   where s.partner_id = v_p.id
      or s.company_id in (select id from public.companies where referred_by = v_p.id);

  if v_cfg.commission_kind = 'first_month_full' then
    v_com := jsonb_build_object('definido', true,
      'texto', 'A primeira mensalidade inteira por loja ativada. No plano anual, '
               'a mensalidade mais ' || trim(to_char(coalesce(v_cfg.percent, 0), 'FM999990.##')) || '%.',
      'total', v_total, 'no_mes', v_no_mes, 'a_receber', v_aberto);
  elsif v_cfg.commission_kind = 'recurring_percent' and coalesce(v_cfg.percent, 0) > 0 then
    v_com := jsonb_build_object('definido', true,
      'texto', v_cfg.percent || '% da mensalidade, todo mês',
      'mes', round(v_mrr * v_cfg.percent / 100, 2));
  elsif v_cfg.commission_kind = 'fixed_per_store' and coalesce(v_cfg.fixed_amount, 0) > 0 then
    v_com := jsonb_build_object('definido', true,
      'texto', 'valor fixo por loja ativada',
      'mes', v_mes * v_cfg.fixed_amount);
  else
    v_com := jsonb_build_object('definido', false,
      'texto', 'O modelo de comissão ainda não foi definido pela Avant Cell.');
  end if;

  return jsonb_build_object(
    'representante', v_p.name,
    'principal', v_p.is_primary,
    'carteira', jsonb_build_object('ativas', v_ativas, 'mrr', v_mrr, 'novas_no_mes', v_mes),
    'comissao', v_com,
    'lojas', coalesce(v_lojas, '[]'::jsonb));
end;
$$;

revoke all on function public.partner_panel(uuid) from public;
grant execute on function public.partner_panel(uuid) to anon, authenticated;
