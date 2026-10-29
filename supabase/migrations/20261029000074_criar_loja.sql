-- Criar loja pelo sistema
-- ----------------------------------------------------------------------
-- Até aqui a única loja nascia junto com a empresa (create_company). Uma
-- segunda unidade só entrava mexendo no banco.
--
-- Criar a linha em stores não basta: sem vínculo em user_stores ninguém
-- enxerga a loja nova, e sem conta de caixa o PDV não tem onde lançar.
-- Por isso é uma função, e não um insert direto da tela.
--
-- Quem tem acesso à loja nova: todo dono (owner) da empresa, com o mesmo
-- papel, e quem a criou. Os demais entram por convite, escolhendo a loja.

create or replace function public.criar_loja(
  p_nome     text,
  p_cnpj     text default null,
  p_telefone text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_empresa uuid := app.current_company_id();
  v_loja    uuid;
  v_nome    text := nullif(btrim(p_nome), '');
begin
  if auth.uid() is null or v_empresa is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if not app.is_admin() then
    raise exception 'Apenas o dono ou administradores podem criar lojas' using errcode = '42501';
  end if;
  if v_nome is null then
    raise exception 'Informe o nome da loja' using errcode = '22023';
  end if;
  if exists (select 1 from public.stores
              where company_id = v_empresa and lower(name) = lower(v_nome)) then
    raise exception 'Já existe uma loja com esse nome' using errcode = '23505';
  end if;

  insert into public.stores (company_id, name, cnpj, phone)
  values (v_empresa, v_nome, nullif(btrim(p_cnpj), ''), nullif(btrim(p_telefone), ''))
  returning id into v_loja;

  -- donos da empresa entram como donos da loja nova
  insert into public.user_stores (user_id, store_id, role_id)
  select distinct us.user_id, v_loja, us.role_id
    from public.user_stores us
    join public.stores s on s.id = us.store_id
    join public.roles r  on r.id = us.role_id
   where s.company_id = v_empresa and r.key = 'owner'
  on conflict do nothing;

  -- e quem criou (pode ser administrador, não dono), com o papel que já tem
  insert into public.user_stores (user_id, store_id, role_id)
  select auth.uid(), v_loja, us.role_id
    from public.user_stores us
    join public.roles r on r.id = us.role_id
   where us.user_id = auth.uid() and r.key in ('owner', 'admin')
   order by (r.key = 'owner') desc
   limit 1
  on conflict do nothing;

  insert into public.accounts (company_id, store_id, name, type)
  values (v_empresa, v_loja, 'Caixa da loja', 'cash');

  return v_loja;
end;
$$;

revoke all on function public.criar_loja(text, text, text) from public;
grant execute on function public.criar_loja(text, text, text) to authenticated;
