-- Representantes do Avant Cell.
--
-- Este módulo não é da loja: é do seu negócio. Aqui ficam as pessoas que
-- vendem o sistema, as lojas que cada uma trouxe, a assinatura de cada loja e
-- a comissão que você deve a elas. Nenhum lojista enxerga nada disto — as
-- tabelas só respondem para quem estiver marcado como equipe Avant Cell.
--
-- A atribuição acontece dos dois jeitos: a loja que se cadastra pelo link do
-- representante já nasce marcada como venda dele, e quem fecha por fora pode
-- ser atribuído à mão depois.
--
-- O modelo de comissão fica PARAMETRIZADO E VAZIO de propósito: enquanto o
-- dono não escolher entre percentual recorrente, percentual da primeira
-- mensalidade ou valor fixo por loja, o painel mostra a carteira e o valor
-- mensal dela, e diz que o modelo não foi definido. Chutar número de comissão
-- é pior do que não mostrar.

-- ---------- quem é da equipe Avant Cell ----------
alter table public.profiles
  add column if not exists is_staff boolean not null default false;

create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_staff from public.profiles where id = auth.uid()), false)
$$;

revoke all on function app.is_staff() from public, anon;
grant execute on function app.is_staff() to authenticated;

-- ---------- representantes ----------
create table if not exists public.partners (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text,
  phone        text,
  token        uuid not null unique default gen_random_uuid(),
  is_primary   boolean not null default false,
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ---------- planos vendidos ----------
create table if not exists public.saas_plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  monthly_price numeric(14,2) not null default 0,
  active        boolean not null default true
);

-- ---------- assinatura de cada loja ----------
create table if not exists public.subscriptions (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null unique references public.companies(id),
  plan_id        uuid references public.saas_plans(id),
  partner_id     uuid references public.partners(id),
  monthly_amount numeric(14,2) not null default 0,
  status         text not null default 'trial',   -- trial | active | past_due | canceled
  started_at     date not null default current_date,
  canceled_at    date,
  notes          text,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_subscriptions_partner on public.subscriptions (partner_id);

-- ---------- a loja lembra quem a trouxe ----------
alter table public.companies
  add column if not exists referred_by uuid references public.partners(id),
  add column if not exists referred_at timestamptz;

-- ---------- modelo de comissão (ainda a definir) ----------
create table if not exists public.partner_settings (
  id               boolean primary key default true check (id),
  commission_kind  text,            -- recurring_percent | first_month_percent | fixed_per_store
  percent          numeric(6,3),
  fixed_amount     numeric(14,2),
  notes            text,
  updated_at       timestamptz not null default now()
);
insert into public.partner_settings (id) values (true) on conflict do nothing;

-- ---------- só a equipe Avant Cell enxerga ----------
alter table public.partners          enable row level security;
alter table public.saas_plans        enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.partner_settings  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['partners', 'saas_plans', 'subscriptions', 'partner_settings'] loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated
         using (app.is_staff()) with check (app.is_staff())', t);
  end loop;
end $$;

-- ---------- cadastro da loja guardando quem indicou ----------
create or replace function public.create_company(
  p_company_name text,
  p_store_name text default 'Loja principal',
  p_referral uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_partner uuid;
begin
  v_company := app.create_company(p_company_name, p_store_name);

  if p_referral is not null then
    select id into v_partner from public.partners where token = p_referral and active;
    if v_partner is not null then
      update public.companies
         set referred_by = v_partner, referred_at = now()
       where id = v_company;

      insert into public.subscriptions (company_id, partner_id, status)
      values (v_company, v_partner, 'trial')
      on conflict (company_id) do update set partner_id = excluded.partner_id;
    end if;
  end if;

  return v_company;
end;
$$;

revoke execute on function public.create_company(text, text, uuid) from public, anon;
grant execute on function public.create_company(text, text, uuid) to authenticated, service_role;

-- ---------- painel do representante (aberto pelo link) ----------
create or replace function public.partner_panel(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p      record;
  v_cfg    record;
  v_lojas  jsonb;
  v_ativas int;
  v_mrr    numeric;
  v_mes    int;
  v_com    jsonb;
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
   where s.partner_id = v_p.id;

  select jsonb_agg(jsonb_build_object(
           'loja', c.trade_name, 'nome', c.name, 'plano', pl.name,
           'valor', s.monthly_amount, 'situacao', s.status,
           'desde', s.started_at) order by s.started_at desc)
    into v_lojas
    from public.subscriptions s
    join public.companies c on c.id = s.company_id
    left join public.saas_plans pl on pl.id = s.plan_id
   where s.partner_id = v_p.id;

  -- comissão só aparece quando o dono definir o modelo
  if v_cfg.commission_kind = 'recurring_percent' and coalesce(v_cfg.percent, 0) > 0 then
    v_com := jsonb_build_object('definido', true,
      'texto', v_cfg.percent || '% da mensalidade, todo mês',
      'mes', round(v_mrr * v_cfg.percent / 100, 2));
  elsif v_cfg.commission_kind = 'first_month_percent' and coalesce(v_cfg.percent, 0) > 0 then
    v_com := jsonb_build_object('definido', true,
      'texto', v_cfg.percent || '% da primeira mensalidade',
      'mes', (select round(coalesce(sum(monthly_amount), 0) * v_cfg.percent / 100, 2)
                from public.subscriptions
               where partner_id = v_p.id and status in ('active', 'trial')
                 and started_at >= date_trunc('month', current_date)));
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

-- ---------- administração (só equipe Avant Cell) ----------
create or replace function public.partner_link_rotate(p_partner uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_novo uuid := gen_random_uuid();
begin
  if not app.is_staff() then
    raise exception 'Área restrita à equipe Avant Cell';
  end if;
  update public.partners set token = v_novo where id = p_partner;
  if not found then
    raise exception 'Representante não encontrado';
  end if;
  return jsonb_build_object('token', v_novo);
end;
$$;

create or replace function public.partner_set_primary(p_partner uuid, p_flag boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_staff() then
    raise exception 'Área restrita à equipe Avant Cell';
  end if;
  if p_flag then
    update public.partners set is_primary = false where is_primary and id <> p_partner;
  end if;
  update public.partners set is_primary = p_flag where id = p_partner;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.partner_link_rotate(uuid) from public, anon;
revoke all on function public.partner_set_primary(uuid, boolean) from public, anon;
grant execute on function public.partner_link_rotate(uuid) to authenticated;
grant execute on function public.partner_set_primary(uuid, boolean) to authenticated;
