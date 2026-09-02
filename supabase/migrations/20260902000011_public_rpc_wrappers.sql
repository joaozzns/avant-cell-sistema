-- Wrappers em public para as funções chamadas via API (PostgREST expõe apenas o schema public)
create or replace function public.create_company(p_company_name text, p_store_name text default 'Loja principal')
returns uuid language sql security definer set search_path = '' as $$
  select app.create_company(p_company_name, p_store_name)
$$;
grant execute on function public.create_company(text, text) to authenticated;

create or replace function public.next_store_number(p_store uuid, p_kind text)
returns bigint language sql security definer set search_path = '' as $$
  select app.next_store_number(p_store, p_kind)
$$;
grant execute on function public.next_store_number(uuid, text) to authenticated;
