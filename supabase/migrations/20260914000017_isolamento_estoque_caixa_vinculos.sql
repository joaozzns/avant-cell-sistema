-- ============================================================
-- AVANT CELL · Isolamento entre empresas em estoque, caixa e vínculos
-- app.is_admin() responde "é dono/admin de ALGUMA loja", sem olhar a
-- empresa. Estas três regras usavam só isso, então o dono de qualquer
-- empresa lia e alterava estoque, caixa e vínculos de lojas alheias
-- (confirmado numa simulação desfeita). Agora a loja precisa ser da
-- empresa de quem acessa; nos vínculos, o usuário também.
-- ============================================================

drop policy if exists stock_write on public.stock_items;
create policy stock_write on public.stock_items for all to authenticated
  using (
    exists (select 1 from public.stores s
             where s.id = stock_items.store_id and s.company_id = app.current_company_id())
    and (app.has_store(store_id) or app.is_admin())
  )
  with check (
    exists (select 1 from public.stores s
             where s.id = stock_items.store_id and s.company_id = app.current_company_id())
    and (app.has_store(store_id) or app.is_admin())
  );

drop policy if exists cashmove_all on public.cash_movements;
create policy cashmove_all on public.cash_movements for all to authenticated
  using (
    exists (select 1 from public.stores s
             where s.id = cash_movements.store_id and s.company_id = app.current_company_id())
    and (app.has_store(store_id) or app.is_admin())
  )
  with check (
    exists (select 1 from public.stores s
             where s.id = cash_movements.store_id and s.company_id = app.current_company_id())
    and (app.has_store(store_id) or app.is_admin())
  );

drop policy if exists user_stores_admin on public.user_stores;
create policy user_stores_admin on public.user_stores for all to authenticated
  using (
    app.is_admin()
    and exists (select 1 from public.stores s
                 where s.id = user_stores.store_id and s.company_id = app.current_company_id())
  )
  with check (
    app.is_admin()
    and exists (select 1 from public.stores s
                 where s.id = user_stores.store_id and s.company_id = app.current_company_id())
    and exists (select 1 from public.profiles p
                 where p.id = user_stores.user_id and p.company_id = app.current_company_id())
  );

drop policy if exists user_stores_select on public.user_stores;
create policy user_stores_select on public.user_stores for select to authenticated
  using (
    user_id = (select auth.uid())
    or (app.is_admin()
        and exists (select 1 from public.stores s
                     where s.id = user_stores.store_id and s.company_id = app.current_company_id()))
  );
