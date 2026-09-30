-- Assinatura da loja ligada ao Mercado Pago
--
-- A estrutura de cobrança já existia desde a migração 050: `saas_plans`,
-- `subscriptions`, `partner_settings` e o cálculo de comissão no painel do
-- representante. O que faltava era o mundo real do outro lado — quem pagou,
-- quando vence, o que fazer quando falha.
--
-- Decisões tomadas em 30/09/2026:
--   • inadimplência: 5 dias de carência e depois só-leitura. A loja continua
--     vendo tudo (vendas, estoque, clientes, histórico) mas não registra nada
--     novo. Bloquear de vez faria a loja perder o caixa do dia por um cartão
--     recusado num sábado à tarde, e isso vira briga, não pagamento.
--   • comissão do representante: valor fixo por loja ativada — o modo
--     `fixed_per_store`, que o painel já sabia calcular.
--   • plano anual: cobrado de uma vez (R$ 900 / 1.164 / 1.788).

-- ---------- 1. o que o Mercado Pago precisa guardar ----------
alter table public.subscriptions
  add column if not exists mp_preapproval_id  text unique,
  add column if not exists mp_plan_id         text,
  add column if not exists charge_period      text not null default 'monthly'
    check (charge_period in ('monthly', 'annual')),
  add column if not exists charged_amount     numeric(14,2),
  add column if not exists current_period_end date,
  add column if not exists grace_until        date,
  add column if not exists last_payment_at    timestamptz,
  add column if not exists payer_email        text;

comment on column public.subscriptions.monthly_amount is
  'Contribuição mensal para o MRR. No plano anual é o valor do ano dividido por 12, '
  'para que a soma das assinaturas continue sendo comparável.';
comment on column public.subscriptions.charged_amount is
  'O que o cartão do lojista é cobrado de fato, no período de charge_period.';

-- ---------- 2. o plano, com os dois períodos ----------
alter table public.saas_plans
  add column if not exists slug               text unique,
  add column if not exists annual_price       numeric(14,2),
  add column if not exists mp_plan_id_monthly text,
  add column if not exists mp_plan_id_annual  text,
  add column if not exists sort_order         int not null default 0;

insert into public.saas_plans (name, slug, monthly_price, annual_price, sort_order, active)
values ('Essencial',    'essencial',     97, 900,  1, true),
       ('Profissional', 'profissional', 127, 1164, 2, true),
       ('Premium',      'premium',      197, 1788, 3, true)
on conflict (slug) do update
  set monthly_price = excluded.monthly_price,
      annual_price  = excluded.annual_price,
      sort_order    = excluded.sort_order;

-- ---------- 3. tudo que o Mercado Pago avisar fica guardado ----------
-- Cru e inteiro, antes de interpretar. Quando uma cobrança não bate com o que
-- a loja diz que pagou, é neste log que a resposta está — e é daqui que dá
-- para reprocessar um aviso que chegou enquanto o sistema estava fora do ar.
create table if not exists public.subscription_events (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  mp_resource_id  text,
  mp_topic        text,
  payload         jsonb not null,
  signature_ok    boolean not null default false,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  error           text
);
create index if not exists idx_sub_events_recurso on public.subscription_events (mp_resource_id);
create index if not exists idx_sub_events_recebido on public.subscription_events (received_at desc);

alter table public.subscription_events enable row level security;
drop policy if exists staff_all on public.subscription_events;
create policy staff_all on public.subscription_events for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- ---------- 4. o modelo de comissão, agora decidido ----------
-- O valor em reais fica em branco de propósito: é dinheiro, e quem define
-- quanto vale trazer uma loja é o dono, não a migração.
update public.partner_settings
   set commission_kind = 'fixed_per_store',
       notes = coalesce(notes, '') ||
               case when notes is null then '' else E'\n' end ||
               'Modelo definido em 30/09/2026: valor fixo por loja ativada. '
               'Falta preencher fixed_amount.',
       updated_at = now()
 where id;

-- ---------- 5. a situação da assinatura, em uma pergunta ----------
create or replace function app.assinatura(p_company uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with s as (
    select * from public.subscriptions
     where company_id = coalesce(p_company, app.current_company_id())
  )
  select case
    when not exists (select 1 from s) then
      jsonb_build_object('situacao', 'sem_assinatura', 'escreve', true,
                         'texto', 'Esta loja ainda não tem assinatura registrada.')
    else (
      select jsonb_build_object(
        'situacao', s.status,
        'plano', (select name from public.saas_plans where id = s.plan_id),
        'periodo', s.charge_period,
        'vence_em', s.current_period_end,
        'carencia_ate', s.grace_until,
        /* só-leitura é o único estado que tira a escrita; trial e carência
           continuam operando normalmente */
        'escreve', s.status <> 'read_only',
        'texto', case s.status
          when 'active'    then 'Assinatura em dia.'
          when 'trial'     then 'Período de avaliação.'
          when 'past_due'  then 'Pagamento pendente. O sistema continua liberado até ' ||
                                coalesce(to_char(s.grace_until, 'DD/MM'), 'o fim da carência') || '.'
          when 'read_only' then 'Assinatura vencida: consulta liberada, lançamentos bloqueados até a regularização.'
          when 'canceled'  then 'Assinatura cancelada.'
          else s.status end)
      from s)
  end
$$;

-- ---------- 6. a trava, para quem for chamar ----------
create or replace function app.exigir_assinatura()
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v jsonb;
begin
  v := app.assinatura();
  if not (v ->> 'escreve')::boolean then
    raise exception '%', v ->> 'texto' using errcode = '42501';
  end if;
end;
$$;

grant execute on function app.assinatura(uuid) to authenticated;
grant execute on function app.exigir_assinatura() to authenticated;
