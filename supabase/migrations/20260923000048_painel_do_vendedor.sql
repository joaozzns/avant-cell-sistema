-- Painel do vendedor.
--
-- Cada vendedor ganha um link próprio. Ele abre no celular e vê o que vendeu,
-- quanto de comissão já fez, quanto falta para a meta e em que posição está —
-- sem login, sem acesso ao sistema da loja, sem enxergar dado de cliente nem
-- de outro vendedor além do ranking.
--
-- O vendedor principal é o dono da operação: enxerga todos, vê o número da
-- loja e não entra na apuração de comissão (ele não comissiona a si mesmo).
--
-- O link é um segredo: quem tem a URL vê o painel. Por isso a função devolve
-- número agregado e a lista das vendas do próprio vendedor — nada que sirva
-- para outra coisa se o link vazar — e existe como trocar o link de lugar.

alter table public.profiles
  add column if not exists seller_token uuid not null default gen_random_uuid(),
  add column if not exists primary_seller boolean not null default false;

create unique index if not exists uq_profiles_seller_token
  on public.profiles (seller_token);

-- ---------- o painel ----------
create or replace function public.seller_panel(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p        record;
  v_ini      date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_fim      date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + interval '1 month')::date;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_periodo  text := to_char(v_ini, 'YYYY-MM');
  v_mes      record;
  v_dia      record;
  v_com      record;
  v_meta     numeric;
  v_bonus    numeric;
  v_ranking  jsonb;
  v_ultimas  jsonb;
  v_loja     jsonb := null;
  v_posicao  int;
begin
  select p.id, p.full_name, p.company_id, p.primary_seller, c.name as empresa
    into v_p
    from public.profiles p
    join public.companies c on c.id = p.company_id
   where p.seller_token = p_token and p.active;
  if not found then
    return jsonb_build_object('erro', 'link inválido');
  end if;

  -- o que ele vendeu no mês e hoje
  select count(*) as qtd, coalesce(sum(total), 0) as total into v_mes
    from public.sales
   where company_id = v_p.company_id and seller_id = v_p.id
     and status in ('completed', 'partially_returned')
     and completed_at >= v_ini and completed_at < v_fim;

  select count(*) as qtd, coalesce(sum(total), 0) as total into v_dia
    from public.sales
   where company_id = v_p.company_id and seller_id = v_p.id
     and status in ('completed', 'partially_returned')
     and (completed_at at time zone 'America/Sao_Paulo')::date = v_hoje;

  -- comissão do mês, já com os estornos de devolução
  select coalesce(sum(amount) filter (where status = 'accrued'), 0)  as a_apurar,
         coalesce(sum(amount) filter (where status = 'approved'), 0) as aprovada,
         coalesce(sum(amount) filter (where status = 'paid'), 0)     as paga,
         coalesce(sum(amount) filter (where reversal_of is not null), 0) as estornos
    into v_com
    from public.commission_entries
   where company_id = v_p.company_id and user_id = v_p.id and period = v_periodo;

  select target, bonus into v_meta, v_bonus
    from public.goals
   where company_id = v_p.company_id and user_id = v_p.id and period = v_periodo
   limit 1;

  -- ranking do mês entre quem vende (o principal fica de fora)
  with vendas as (
    select s.seller_id, sum(s.total) as total, count(*) as qtd
      from public.sales s
     where s.company_id = v_p.company_id
       and s.status in ('completed', 'partially_returned')
       and s.completed_at >= v_ini and s.completed_at < v_fim
       and s.seller_id is not null
     group by s.seller_id
  ),
  lista as (
    select pr.id, pr.full_name, coalesce(v.total, 0) as total, coalesce(v.qtd, 0) as qtd,
           row_number() over (order by coalesce(v.total, 0) desc) as posicao
      from public.profiles pr
      left join vendas v on v.seller_id = pr.id
     where pr.company_id = v_p.company_id and pr.active and not pr.primary_seller
  )
  select jsonb_agg(jsonb_build_object(
           'posicao', posicao,
           -- vendedor comum vê só o primeiro nome dos colegas; o principal vê todos
           'nome', case when v_p.primary_seller or id = v_p.id
                        then full_name else split_part(full_name, ' ', 1) end,
           'eu', id = v_p.id,
           'total', total, 'vendas', qtd) order by posicao)
    into v_ranking from lista;

  select posicao into v_posicao from (
    select pr.id, row_number() over (order by coalesce(sum(s.total), 0) desc) as posicao
      from public.profiles pr
      left join public.sales s on s.seller_id = pr.id
        and s.status in ('completed', 'partially_returned')
        and s.completed_at >= v_ini and s.completed_at < v_fim
     where pr.company_id = v_p.company_id and pr.active and not pr.primary_seller
     group by pr.id
  ) r where r.id = v_p.id;

  -- as últimas vendas dele: só número, data e valor
  select jsonb_agg(jsonb_build_object(
           'numero', numero, 'data', data, 'total', total, 'cliente', cliente) order by data desc)
    into v_ultimas
    from (
      select s.number as numero, s.completed_at as data, s.total,
             split_part(coalesce(cu.name, 'Balcão'), ' ', 1) as cliente
        from public.sales s
        left join public.customers cu on cu.id = s.customer_id
       where s.company_id = v_p.company_id and s.seller_id = v_p.id
         and s.status in ('completed', 'partially_returned')
       order by s.completed_at desc
       limit 8
    ) u;

  -- o principal enxerga o número da loja inteira
  if v_p.primary_seller then
    select jsonb_build_object(
      'vendas_mes', coalesce(sum(total), 0),
      'qtd_mes', count(*),
      'comissao_mes', (select coalesce(sum(amount), 0) from public.commission_entries
                        where company_id = v_p.company_id and period = v_periodo))
      into v_loja
      from public.sales
     where company_id = v_p.company_id
       and status in ('completed', 'partially_returned')
       and completed_at >= v_ini and completed_at < v_fim;
  end if;

  return jsonb_build_object(
    'vendedor', v_p.full_name,
    'empresa', v_p.empresa,
    'principal', v_p.primary_seller,
    'periodo', v_periodo,
    'mes', jsonb_build_object('vendas', v_mes.qtd, 'total', v_mes.total,
             'ticket', case when v_mes.qtd > 0 then round(v_mes.total / v_mes.qtd, 2) else 0 end),
    'hoje', jsonb_build_object('vendas', v_dia.qtd, 'total', v_dia.total),
    'comissao', jsonb_build_object('a_apurar', v_com.a_apurar, 'aprovada', v_com.aprovada,
                 'paga', v_com.paga, 'estornos', v_com.estornos,
                 'total', v_com.a_apurar + v_com.aprovada + v_com.paga),
    'meta', jsonb_build_object('alvo', coalesce(v_meta, 0), 'bonus', coalesce(v_bonus, 0),
             'atingido', case when coalesce(v_meta, 0) > 0
                              then round(v_mes.total / v_meta * 100, 1) else null end),
    'posicao', v_posicao,
    'ranking', coalesce(v_ranking, '[]'::jsonb),
    'ultimas', coalesce(v_ultimas, '[]'::jsonb),
    'loja', v_loja
  );
end;
$$;

revoke all on function public.seller_panel(uuid) from public;
grant execute on function public.seller_panel(uuid) to anon, authenticated;

-- ---------- administração dos vendedores ----------
create or replace function public.seller_set_primary(p_user uuid, p_flag boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := app.current_company_id();
begin
  if not app.is_admin() then
    raise exception 'Só o dono ou gerente define o vendedor principal';
  end if;
  perform 1 from public.profiles where id = p_user and company_id = v_company;
  if not found then
    raise exception 'Vendedor não encontrado';
  end if;

  -- principal é um só: quem assume, tira o anterior
  if p_flag then
    update public.profiles set primary_seller = false
     where company_id = v_company and primary_seller and id <> p_user;
  end if;

  update public.profiles set primary_seller = p_flag where id = p_user;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.seller_link_rotate(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := app.current_company_id();
  v_novo uuid := gen_random_uuid();
begin
  if not app.is_admin() then
    raise exception 'Só o dono ou gerente troca o link do vendedor';
  end if;
  update public.profiles set seller_token = v_novo
   where id = p_user and company_id = v_company;
  if not found then
    raise exception 'Vendedor não encontrado';
  end if;
  return jsonb_build_object('token', v_novo);
end;
$$;

revoke all on function public.seller_set_primary(uuid, boolean) from public, anon;
revoke all on function public.seller_link_rotate(uuid) from public, anon;
grant execute on function public.seller_set_primary(uuid, boolean) to authenticated;
grant execute on function public.seller_link_rotate(uuid) to authenticated;
