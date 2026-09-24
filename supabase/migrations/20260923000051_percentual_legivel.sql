-- Percentual escrito como gente escreve.
--
-- A coluna é numeric(6,3), então "20" virava "20.000% da mensalidade" no
-- painel do representante. Número com três casas no meio de uma frase parece
-- erro de sistema.

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
      'texto', trim(to_char(v_cfg.percent, 'FM999990.##')) || '% da mensalidade, todo mês',
      'mes', round(v_mrr * v_cfg.percent / 100, 2));
  elsif v_cfg.commission_kind = 'first_month_percent' and coalesce(v_cfg.percent, 0) > 0 then
    v_com := jsonb_build_object('definido', true,
      'texto', trim(to_char(v_cfg.percent, 'FM999990.##')) || '% da primeira mensalidade',
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
