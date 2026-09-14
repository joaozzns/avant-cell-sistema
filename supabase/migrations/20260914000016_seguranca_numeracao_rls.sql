-- ============================================================
-- AVANT CELL · Numeração protegida por empresa e RLS mais leve
-- ============================================================

-- 1) Numeração sequencial (venda, OS, orçamento, pedido de compra)
--    Antes, qualquer chamador — até sem login — avançava o contador de
--    qualquer loja, abrindo saltos na numeração. Agora, pela API, só numera
--    lojas da própria empresa. service_role e acesso direto ao banco
--    (migrations, SQL Editor) seguem livres.
create or replace function app.next_store_number(p_store uuid, p_kind text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v bigint;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if auth.uid() is null or not exists (
      select 1 from public.stores s
       where s.id = p_store and s.company_id = app.current_company_id()
    ) then
      raise exception 'Loja não pertence à sua empresa' using errcode = '42501';
    end if;
  end if;

  insert into public.store_counters (store_id, kind, value)
  values (p_store, p_kind, 1)
  on conflict (store_id, kind)
  do update set value = public.store_counters.value + 1
  returning value into v;
  return v;
end;
$$;

-- 2) Sem login não há por que numerar nem criar empresa
revoke execute on function app.next_store_number(uuid, text)    from public, anon;
revoke execute on function public.next_store_number(uuid, text) from public, anon;
grant  execute on function app.next_store_number(uuid, text)    to authenticated, service_role;
grant  execute on function public.next_store_number(uuid, text) to authenticated, service_role;

revoke execute on function app.create_company(text, text)    from public, anon;
revoke execute on function public.create_company(text, text) from public, anon;
grant  execute on function app.create_company(text, text)    to authenticated, service_role;
grant  execute on function public.create_company(text, text) to authenticated, service_role;

-- 3) RLS: auth.uid() dentro de subselect é avaliado uma vez por consulta,
--    não uma vez por linha. Mesmas condições de antes.
alter policy profiles_select on public.profiles
  using ((id = (select auth.uid())) or (company_id = app.current_company_id()));

alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy user_stores_select on public.user_stores
  using ((user_id = (select auth.uid())) or app.is_admin());
