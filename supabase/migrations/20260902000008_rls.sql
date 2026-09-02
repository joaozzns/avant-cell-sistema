-- ============================================================
-- AVANT CELL · Row Level Security
-- Isolamento por empresa (tenant) e por loja (store_id)
-- ============================================================

-- Habilita RLS em todas as tabelas do schema public
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Tabelas especiais ----------
create policy company_select on public.companies for select to authenticated
  using (id = app.current_company_id());
create policy company_update on public.companies for update to authenticated
  using (id = app.current_company_id() and app.is_admin())
  with check (id = app.current_company_id());

create policy stores_select on public.stores for select to authenticated
  using (company_id = app.current_company_id());
create policy stores_write on public.stores for all to authenticated
  using (company_id = app.current_company_id() and app.is_admin())
  with check (company_id = app.current_company_id() and app.is_admin());

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or company_id = app.current_company_id());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_admin on public.profiles for update to authenticated
  using (company_id = app.current_company_id() and app.is_admin())
  with check (company_id = app.current_company_id());

create policy user_stores_select on public.user_stores for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
create policy user_stores_admin on public.user_stores for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy roles_select on public.roles for select to authenticated
  using (company_id is null or company_id = app.current_company_id());
create policy roles_admin on public.roles for all to authenticated
  using (company_id = app.current_company_id() and app.is_admin())
  with check (company_id = app.current_company_id() and app.is_admin());

create policy permissions_select on public.permissions for select to authenticated
  using (true);

create policy role_perms_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id
                 and (r.company_id is null or r.company_id = app.current_company_id())));
create policy role_perms_admin on public.role_permissions for all to authenticated
  using (app.is_admin() and exists (select 1 from public.roles r where r.id = role_id
                 and r.company_id = app.current_company_id()))
  with check (app.is_admin() and exists (select 1 from public.roles r where r.id = role_id
                 and r.company_id = app.current_company_id()));

-- Log de auditoria: somente leitura, somente admin
create policy audit_select on public.audit_logs for select to authenticated
  using (app.is_admin() and company_id = app.current_company_id());

-- store_counters: sem policies (acesso só via app.next_store_number)

-- Transferências: participantes das duas lojas
create policy transfers_select on public.transfers for select to authenticated
  using (company_id = app.current_company_id());
create policy transfers_write on public.transfers for all to authenticated
  using (company_id = app.current_company_id()
         and (app.has_store(from_store) or app.has_store(to_store) or app.is_admin()))
  with check (company_id = app.current_company_id()
         and (app.has_store(from_store) or app.has_store(to_store) or app.is_admin()));

-- Histórico de preço e de status: leitura via tenant, escrita só por trigger
create policy price_history_select on public.price_history for select to authenticated
  using (company_id = app.current_company_id());
create policy os_history_select on public.os_status_history for select to authenticated
  using (exists (select 1 from public.service_orders o
                 where o.id = os_id and o.company_id = app.current_company_id()));

-- ---------- Padrão A · escopo empresa (leitura e escrita por tenant) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','brands','device_models','products','payment_methods',
    'customers','customer_devices','message_templates','messages','campaigns',
    'segments','surveys','lgpd_requests','suppliers','accounts',
    'finance_categories','cost_centers','commission_rules','commission_entries','goals',
    'fiscal_settings','fiscal_operations','tax_rules','integrations','settings',
    'terms','alerts','payables','transactions','card_settlements',
    'customer_credit_profiles','store_credits'
  ]
  loop
    execute format(
      'create policy tenant_all on public.%I for all to authenticated
         using (company_id = app.current_company_id())
         with check (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ---------- Padrão B · leitura por empresa, escrita pela loja ----------
-- (estoque é consultável entre lojas; movimentação só por quem opera a unidade)
do $$
declare t text;
begin
  foreach t in array array[
    'stock_items','serialized_units','stock_movements','stock_entries',
    'stock_adjustments','inventories','reservations','trade_ins'
  ]
  loop
    execute format(
      'create policy tenant_read on public.%I for select to authenticated
         using (company_id = app.current_company_id())', t);
    execute format(
      'create policy store_insert on public.%I for insert to authenticated
         with check (company_id = app.current_company_id() and (app.has_store(store_id) or app.is_admin()))', t);
    execute format(
      'create policy store_update on public.%I for update to authenticated
         using (company_id = app.current_company_id() and (app.has_store(store_id) or app.is_admin()))
         with check (company_id = app.current_company_id() and (app.has_store(store_id) or app.is_admin()))', t);
    execute format(
      'create policy store_delete on public.%I for delete to authenticated
         using (company_id = app.current_company_id() and (app.has_store(store_id) or app.is_admin()))', t);
  end loop;
end $$;

-- stock_items não tem company_id: política própria via loja
drop policy if exists tenant_read on public.stock_items;
drop policy if exists store_insert on public.stock_items;
drop policy if exists store_update on public.stock_items;
drop policy if exists store_delete on public.stock_items;
create policy stock_read on public.stock_items for select to authenticated
  using (exists (select 1 from public.stores s
                 where s.id = store_id and s.company_id = app.current_company_id()));
create policy stock_write on public.stock_items for all to authenticated
  using (app.has_store(store_id) or app.is_admin())
  with check (app.has_store(store_id) or app.is_admin());

-- ---------- Padrão C · escopo estrito da loja ----------
do $$
declare t text;
begin
  foreach t in array array[
    'cash_sessions','cash_movements','sales','quotes','sale_returns',
    'service_orders','appointments','purchase_orders','receivables','fiscal_documents'
  ]
  loop
    execute format(
      'create policy store_all on public.%I for all to authenticated
         using (company_id = app.current_company_id() and (app.has_store(store_id) or app.is_admin()))
         with check (company_id = app.current_company_id() and (app.has_store(store_id) or app.is_admin()))', t);
  end loop;
end $$;

-- cash_movements não tem company_id: política própria via sessão
drop policy if exists store_all on public.cash_movements;
create policy cashmove_all on public.cash_movements for all to authenticated
  using (app.has_store(store_id) or app.is_admin())
  with check (app.has_store(store_id) or app.is_admin());

-- ---------- Tabelas filhas · acesso via registro pai ----------
do $$
declare r record;
begin
  for r in
    select * from (values
      ('product_variants',    'products',        'product_id'),
      ('product_models',      'products',        'product_id'),
      ('kit_items',           'products',        'kit_product_id'),
      ('supplier_prices',     'suppliers',       'supplier_id'),
      ('stock_entry_items',   'stock_entries',   'entry_id'),
      ('transfer_items',      'transfers',       'transfer_id'),
      ('inventory_items',     'inventories',     'inventory_id'),
      ('sale_items',          'sales',           'sale_id'),
      ('sale_payments',       'sales',           'sale_id'),
      ('quote_items',         'quotes',          'quote_id'),
      ('sale_return_items',   'sale_returns',    'return_id'),
      ('os_diagnostics',      'service_orders',  'os_id'),
      ('os_quotes',           'service_orders',  'os_id'),
      ('os_parts',            'service_orders',  'os_id'),
      ('os_labor_logs',       'service_orders',  'os_id'),
      ('os_external_services','service_orders',  'os_id'),
      ('os_comments',         'service_orders',  'os_id'),
      ('os_attachments',      'service_orders',  'os_id'),
      ('os_contact_attempts', 'service_orders',  'os_id'),
      ('purchase_order_items','purchase_orders', 'po_id'),
      ('campaign_sends',      'campaigns',       'campaign_id')
    ) as v(child, parent, fk)
  loop
    execute format(
      'create policy child_all on public.%I for all to authenticated
         using (exists (select 1 from public.%I p
                        where p.id = %I.%I and p.company_id = app.current_company_id()))
         with check (exists (select 1 from public.%I p
                        where p.id = %I.%I and p.company_id = app.current_company_id()))',
      r.child, r.parent, r.child, r.fk, r.parent, r.child, r.fk);
  end loop;
end $$;

-- os_quote_items: pai é os_quotes, que aponta para a OS
create policy child_all on public.os_quote_items for all to authenticated
  using (exists (select 1 from public.os_quotes q
                 join public.service_orders o on o.id = q.os_id
                 where q.id = quote_id and o.company_id = app.current_company_id()))
  with check (exists (select 1 from public.os_quotes q
                 join public.service_orders o on o.id = q.os_id
                 where q.id = quote_id and o.company_id = app.current_company_id()));

-- ---------- Storage ----------
create policy "avantcell authenticated read" on storage.objects for select to authenticated
  using (bucket_id in ('os-media','products','documents','fiscal','branding'));
create policy "avantcell authenticated write" on storage.objects for insert to authenticated
  with check (bucket_id in ('os-media','products','documents','fiscal','branding'));
create policy "avantcell authenticated update" on storage.objects for update to authenticated
  using (bucket_id in ('os-media','products','branding'));

-- ---------- Auditoria automática nas tabelas sensíveis ----------
do $$
declare t text;
begin
  foreach t in array array[
    'sales','sale_payments','sale_returns','service_orders','os_quotes',
    'cash_sessions','cash_movements','stock_adjustments','serialized_units',
    'receivables','payables','fiscal_documents','trade_ins','user_stores',
    'role_permissions','settings','integrations'
  ]
  loop
    execute format(
      'create trigger trg_audit_%s after insert or update or delete on public.%I
         for each row execute function app.audit_row()', t, t);
  end loop;
end $$;
