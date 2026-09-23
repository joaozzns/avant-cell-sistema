-- Limite de crediário.
--
-- O sistema vendia a prazo sem limite nenhum: qualquer atendente parcelava
-- qualquer valor para qualquer cliente, e o único freio era o bom senso de
-- quem estava no balcão. A tabela de perfil de crédito existia com limite,
-- renda e bloqueio — e ninguém consultava.
--
-- Agora a venda a prazo passa por três perguntas, nesta ordem: o cliente está
-- bloqueado? tem parcela vencida? cabe no limite que sobrou? A checagem mora
-- no gatilho que cria as parcelas, então vale para qualquer caminho — PDV,
-- importação ou chamada direta à API.
--
-- Não existe "autorizar esta venda": quando falta limite, quem tem permissão
-- revisa o limite do cliente e a revisão fica na auditoria. Aprovação que não
-- deixa rastro é exatamente o buraco por onde a loja perde dinheiro.

-- ---------- quanto o cliente ainda pode comprar a prazo ----------
create or replace function app.credito_disponivel(p_customer uuid)
returns table (
  limite numeric, usado numeric, disponivel numeric,
  bloqueado boolean, motivo text, vencida_em date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with perfil as (
    select coalesce(credit_limit, 0) as limite, blocked, blocked_reason
      from public.customer_credit_profiles where customer_id = p_customer
  ),
  aberto as (
    select coalesce(sum(amount - coalesce(paid_amount, 0)), 0) as usado,
           min(due_date) filter (where due_date < current_date) as vencida
      from public.receivables
     where customer_id = p_customer and status in ('open', 'partial')
  )
  select coalesce(p.limite, 0),
         a.usado,
         greatest(coalesce(p.limite, 0) - a.usado, 0),
         coalesce(p.blocked, false),
         p.blocked_reason,
         a.vencida
    from aberto a left join perfil p on true
$$;

revoke all on function app.credito_disponivel(uuid) from public, anon;
grant execute on function app.credito_disponivel(uuid) to authenticated;

-- ---------- a venda a prazo respeita o limite ----------
create or replace function app.create_credit_installments(
  p_sale uuid, p_amount numeric, p_n int, p_first_due date
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale record;
  v_cred record;
  i int; v_each numeric; v_last numeric;
begin
  select * into v_sale from public.sales where id = p_sale;
  if v_sale.customer_id is null then
    raise exception 'Crediário exige cliente cadastrado na venda';
  end if;

  select * into v_cred from app.credito_disponivel(v_sale.customer_id);

  if v_cred.bloqueado then
    raise exception 'Cliente bloqueado para novas compras a prazo%',
      coalesce(': ' || v_cred.motivo, '');
  end if;

  if v_cred.vencida_em is not null then
    raise exception 'Cliente tem parcela vencida desde %. Regularize antes de vender a prazo.',
      to_char(v_cred.vencida_em, 'DD/MM/YYYY');
  end if;

  if v_cred.limite <= 0 then
    raise exception 'Cliente sem limite de crediário aprovado. Um gerente precisa definir o limite antes da venda a prazo.';
  end if;

  if p_amount > v_cred.disponivel then
    raise exception 'Crediário acima do limite: disponível % de % (já usa %). Peça revisão do limite.',
      app.brl(v_cred.disponivel), app.brl(v_cred.limite), app.brl(v_cred.usado);
  end if;

  v_each := trunc(p_amount / p_n, 2);
  v_last := p_amount - v_each * (p_n - 1);

  for i in 1..p_n loop
    insert into public.receivables
      (company_id, store_id, customer_id, sale_id, description,
       installment_no, installments_total, due_date, original_due_date, amount)
    values
      (v_sale.company_id, v_sale.store_id, v_sale.customer_id, p_sale,
       'Venda #' || v_sale.number || ' · parcela ' || i || '/' || p_n,
       i, p_n,
       p_first_due + ((i - 1) * interval '30 days'),
       p_first_due + ((i - 1) * interval '30 days'),
       case when i = p_n then v_last else v_each end);
  end loop;
end;
$$;

-- ---------- quem define o limite ----------
create or replace function public.credit_profile_set(p jsonb)
returns jsonb
language plpgsql
-- definer por causa do registro de auditoria; a permissão é conferida abaixo
security definer
set search_path = ''
as $$
declare
  v_company  uuid := app.current_company_id();
  v_cliente  uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_limite   numeric := coalesce((p ->> 'credit_limit')::numeric, 0);
  v_bloqueado boolean := coalesce((p ->> 'blocked')::boolean, false);
  v_antes    record;
begin
  if v_company is null then
    raise exception 'Empresa não identificada';
  end if;
  if not app.has_permission('credit.approve_limit', null) then
    raise exception 'Só quem aprova limite de crediário pode mexer neste cadastro';
  end if;
  if v_limite < 0 then
    raise exception 'Limite não pode ser negativo';
  end if;

  perform 1 from public.customers where id = v_cliente and company_id = v_company;
  if not found then
    raise exception 'Cliente não encontrado';
  end if;

  select * into v_antes from public.customer_credit_profiles where customer_id = v_cliente;

  insert into public.customer_credit_profiles
    (customer_id, company_id, credit_limit, declared_income, internal_score,
     blocked, blocked_reason, notes, updated_at)
  values
    (v_cliente, v_company, v_limite,
     nullif(p ->> 'declared_income', '')::numeric,
     nullif(p ->> 'internal_score', '')::int,
     v_bloqueado, nullif(trim(p ->> 'blocked_reason'), ''),
     nullif(trim(p ->> 'notes'), ''), now())
  on conflict (customer_id) do update
    set credit_limit = excluded.credit_limit,
        declared_income = coalesce(excluded.declared_income, public.customer_credit_profiles.declared_income),
        internal_score = coalesce(excluded.internal_score, public.customer_credit_profiles.internal_score),
        blocked = excluded.blocked,
        blocked_reason = excluded.blocked_reason,
        notes = coalesce(excluded.notes, public.customer_credit_profiles.notes),
        updated_at = now();

  insert into public.audit_logs
    (company_id, user_id, action, table_name, record_id, before, after, reason)
  values
    (v_company, auth.uid(), 'update', 'customer_credit_profiles', v_cliente::text,
     jsonb_build_object('limite', coalesce(v_antes.credit_limit, 0), 'bloqueado', coalesce(v_antes.blocked, false)),
     jsonb_build_object('limite', v_limite, 'bloqueado', v_bloqueado),
     nullif(trim(p ->> 'reason'), ''));

  return jsonb_build_object('ok', true, 'limite', v_limite);
end;
$$;

revoke all on function public.credit_profile_set(jsonb) from public, anon;
grant execute on function public.credit_profile_set(jsonb) to authenticated;

-- ---------- consulta usada pelas telas ----------
create or replace function public.credit_status(p_customer uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'limite', c.limite, 'usado', c.usado, 'disponivel', c.disponivel,
    'bloqueado', c.bloqueado, 'motivo', c.motivo, 'vencida_em', c.vencida_em)
    from app.credito_disponivel(p_customer) c
$$;

revoke all on function public.credit_status(uuid) from public, anon;
grant execute on function public.credit_status(uuid) to authenticated;
