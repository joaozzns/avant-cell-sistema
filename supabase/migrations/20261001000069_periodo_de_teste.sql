-- Loja nova entrava e usava de graça, para sempre
--
-- `create_company` só criava assinatura quando havia indicação de um
-- representante — e, mesmo nesse caso, em `trial` sem data de fim. Como
-- `app.assinatura()` responde `escreve: true` tanto para "sem assinatura"
-- quanto para "trial", o resultado era o mesmo nos dois caminhos: qualquer
-- pessoa que se cadastrasse ficava com o sistema completo, sem pagar, sem
-- prazo e sem ninguém perceber. Não era um defeito de código; era a ausência
-- da regra.
--
-- Agora toda empresa nasce com assinatura em avaliação e uma data para
-- acabar. Quando a data passa, a rotina diária fecha os lançamentos — a mesma
-- porta da inadimplência, com a mesma mensagem e a mesma consulta liberada.
--
-- São 14 dias por padrão, e ficam no banco de propósito: mudar o prazo é um
-- update, não um deploy.

create table if not exists public.saas_settings (
  id          boolean primary key default true check (id),
  trial_days  int not null default 14 check (trial_days >= 0),
  notes       text,
  updated_at  timestamptz not null default now()
);
insert into public.saas_settings (id) values (true) on conflict do nothing;

alter table public.saas_settings enable row level security;
drop policy if exists staff_all on public.saas_settings;
create policy staff_all on public.saas_settings for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

comment on column public.saas_settings.trial_days is
  'Dias de avaliação de uma loja nova. Zero faz a loja nascer já bloqueada '
  'para lançamentos, o que só faz sentido se a venda for sempre assistida.';

-- ---------- toda empresa nasce com prazo ----------
create or replace function public.create_company(
  p_company_name text,
  p_store_name text default 'Loja principal',
  p_referral uuid default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_company uuid;
  v_partner uuid;
  v_dias    int;
begin
  v_company := app.create_company(p_company_name, p_store_name);

  if p_referral is not null then
    select id into v_partner from public.partners where token = p_referral and active;
    if v_partner is not null then
      update public.companies
         set referred_by = v_partner, referred_at = now()
       where id = v_company;
    end if;
  end if;

  select trial_days into v_dias from public.saas_settings where id;

  /* a assinatura nasce junto da empresa, com ou sem representante: é ela que
     dá o prazo, e sem ela o sistema não teria o que cobrar nem o que travar */
  insert into public.subscriptions
    (company_id, partner_id, status, started_at, current_period_end)
  values
    (v_company, v_partner, 'trial', current_date,
     current_date + coalesce(v_dias, 14))
  on conflict (company_id) do update
    set partner_id = coalesce(excluded.partner_id, public.subscriptions.partner_id);

  return v_company;
end;
$$;

-- ---------- a avaliação também vence ----------
create or replace function public.assinaturas_vencer_carencia()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_carencia int; v_cancelada int; v_teste int;
begin
  update public.subscriptions
     set status = 'read_only', updated_at = now()
   where status = 'past_due'
     and grace_until is not null
     and grace_until < current_date;
  get diagnostics v_carencia = row_count;

  update public.subscriptions
     set status = 'read_only', updated_at = now()
   where status = 'canceled'
     and current_period_end is not null
     and current_period_end < current_date;
  get diagnostics v_cancelada = row_count;

  -- avaliação que acabou e não virou pagamento
  update public.subscriptions
     set status = 'read_only', updated_at = now()
   where status = 'trial'
     and current_period_end is not null
     and current_period_end < current_date;
  get diagnostics v_teste = row_count;

  return jsonb_build_object(
    'carencia_vencida', v_carencia,
    'cancelamento_consumido', v_cancelada,
    'avaliacao_encerrada', v_teste,
    'rodou_em', now());
end;
$$;

revoke execute on function public.assinaturas_vencer_carencia() from public, anon, authenticated;

-- ---------- a loja passa a saber quanto falta ----------
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
        'escreve', s.status <> 'read_only',
        'texto', case s.status
          when 'active'    then 'Assinatura em dia.'
          when 'trial'     then 'Período de avaliação' ||
                                coalesce(': termina em ' || to_char(s.current_period_end, 'DD/MM') ||
                                         ' (' || greatest(s.current_period_end - current_date, 0) ||
                                         ' dia(s)).', '.')
          when 'past_due'  then 'Pagamento pendente. O sistema continua liberado até ' ||
                                coalesce(to_char(s.grace_until, 'DD/MM'), 'o fim da carência') || '.'
          when 'read_only' then 'Assinatura vencida: consulta liberada, lançamentos bloqueados até a regularização.'
          when 'canceled'  then 'Assinatura cancelada.'
          else s.status end)
      from s)
  end
$$;
