-- Marcar alguém como equipe Avant Cell pela tela.
--
-- Até agora essa marcação só existia no banco, o que deixava o dono do produto
-- dependente de alguém com acesso ao Supabase para liberar a própria conta.
--
-- A regra que sustenta tudo: **só quem já é da equipe promove outra pessoa**.
-- Sem isso, qualquer administrador de loja se promoveria e passaria a ver
-- quanto cada loja paga, quem vendeu e quanto se deve de comissão — o negócio
-- inteiro da Avant Cell. Também não deixamos a última pessoa da equipe se
-- rebaixar, porque aí ninguém mais consegue promover ninguém.

create or replace function public.staff_set(p_user uuid, p_flag boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome  text;
  v_quant int;
begin
  if not app.is_staff() then
    raise exception 'Só quem já é da equipe Avant Cell pode marcar outra pessoa';
  end if;

  select full_name into v_nome from public.profiles where id = p_user;
  if v_nome is null then
    raise exception 'Usuário não encontrado';
  end if;

  if not p_flag then
    select count(*) into v_quant from public.profiles where is_staff;
    if v_quant <= 1 then
      raise exception 'Esta é a última pessoa da equipe: tirar a marcação deixaria o painel sem dono';
    end if;
  end if;

  update public.profiles set is_staff = p_flag where id = p_user;

  insert into public.audit_logs
    (company_id, user_id, action, table_name, record_id, after, reason)
  values
    (app.current_company_id(), auth.uid(), 'update', 'profiles', p_user::text,
     jsonb_build_object('equipe_avant_cell', p_flag, 'pessoa', v_nome),
     case when p_flag then 'Passou a ver o painel de representantes'
          else 'Deixou de ver o painel de representantes' end);

  return jsonb_build_object('ok', true, 'equipe', p_flag);
end;
$$;

revoke all on function public.staff_set(uuid, boolean) from public, anon;
grant execute on function public.staff_set(uuid, boolean) to authenticated;
