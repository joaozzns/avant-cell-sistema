-- ============================================================
-- AVANT CELL · Seed: permissões, papéis do sistema e bootstrap
-- ============================================================

-- ---------- Catálogo de permissões ----------
insert into public.permissions (key, module, action, description) values
  ('dashboard.view',          'dashboard', 'view',   'Ver dashboard gerencial'),
  ('dashboard.view_money',    'dashboard', 'view',   'Ver faturamento, custo e margem'),
  ('sales.create',            'sales',     'create', 'Registrar venda no PDV'),
  ('sales.view_all',          'sales',     'view',   'Ver vendas de todos os vendedores'),
  ('sales.discount',          'sales',     'update', 'Dar desconto (limite em %)'),
  ('sales.below_min_price',   'sales',     'update', 'Vender abaixo do preço mínimo'),
  ('sales.cancel',            'sales',     'delete', 'Cancelar venda'),
  ('sales.return',            'sales',     'update', 'Fazer devolução/troca'),
  ('cash.open',               'cash',      'create', 'Abrir caixa'),
  ('cash.close',              'cash',      'update', 'Fechar caixa'),
  ('cash.reopen',             'cash',      'update', 'Reabrir caixa fechado'),
  ('cash.withdrawal',         'cash',      'create', 'Fazer sangria (limite em R$)'),
  ('credit.sell',             'credit',    'create', 'Vender no crediário'),
  ('credit.approve_limit',    'credit',    'update', 'Aprovar limite de crediário'),
  ('products.view',           'products',  'view',   'Consultar catálogo'),
  ('products.manage',         'products',  'update', 'Criar e editar produtos'),
  ('products.view_cost',      'products',  'view',   'Ver custo e margem'),
  ('products.change_price',   'products',  'update', 'Alterar preços'),
  ('stock.entry',             'stock',     'create', 'Lançar entrada de estoque'),
  ('stock.transfer',          'stock',     'create', 'Criar transferência entre lojas'),
  ('stock.adjust',            'stock',     'update', 'Fazer ajuste/perda'),
  ('stock.adjust_approve',    'stock',     'approve','Aprovar ajuste de estoque'),
  ('stock.inventory',         'stock',     'create', 'Fazer inventário'),
  ('os.create',               'os',        'create', 'Abrir OS'),
  ('os.view_all',             'os',        'view',   'Ver OS de todos os técnicos'),
  ('os.diagnose',             'os',        'update', 'Registrar diagnóstico e laudo'),
  ('os.quote',                'os',        'update', 'Montar orçamento da OS'),
  ('os.deliver',              'os',        'update', 'Entregar aparelho'),
  ('os.cancel',               'os',        'delete', 'Cancelar OS'),
  ('customers.view',          'customers', 'view',   'Consultar clientes'),
  ('customers.manage',        'customers', 'update', 'Criar e editar clientes'),
  ('customers.export',        'customers', 'export', 'Exportar dados de clientes'),
  ('crm.message',             'crm',       'create', 'Enviar mensagens'),
  ('crm.campaign',            'crm',       'create', 'Criar campanhas'),
  ('purchases.create',        'purchases', 'create', 'Criar pedido de compra'),
  ('purchases.approve',       'purchases', 'approve','Aprovar pedido (limite em R$)'),
  ('finance.view',            'finance',   'view',   'Ver financeiro'),
  ('finance.receivables',     'finance',   'update', 'Baixar contas a receber'),
  ('finance.payables',        'finance',   'update', 'Lançar e pagar contas'),
  ('finance.payables_approve','finance',   'approve','Aprovar pagamento (limite em R$)'),
  ('finance.reconcile',       'finance',   'update', 'Conciliar cartões e Pix'),
  ('finance.dre',             'finance',   'view',   'Ver DRE'),
  ('fiscal.issue',            'fiscal',    'create', 'Emitir documentos fiscais'),
  ('fiscal.cancel',           'fiscal',    'delete', 'Cancelar nota'),
  ('fiscal.configure',        'fiscal',    'update', 'Configurações fiscais'),
  ('reports.view',            'reports',   'view',   'Ver relatórios'),
  ('reports.export',          'reports',   'export', 'Exportar relatórios'),
  ('admin.users',             'admin',     'update', 'Gerenciar usuários'),
  ('admin.roles',             'admin',     'update', 'Gerenciar perfis e permissões'),
  ('admin.stores',            'admin',     'update', 'Gerenciar lojas'),
  ('admin.settings',          'admin',     'update', 'Configurações gerais'),
  ('admin.integrations',      'admin',     'update', 'Gerenciar integrações'),
  ('admin.audit',             'admin',     'view',   'Ver log de auditoria')
on conflict (key) do nothing;

-- ---------- Papéis do sistema ----------
insert into public.roles (id, company_id, key, name, is_system) values
  ('00000000-0000-0000-0000-000000000001', null, 'owner',      'Proprietário / Admin', true),
  ('00000000-0000-0000-0000-000000000002', null, 'admin',      'Administrador',        true),
  ('00000000-0000-0000-0000-000000000003', null, 'manager',    'Gerente de loja',      true),
  ('00000000-0000-0000-0000-000000000004', null, 'seller',     'Vendedor / Atendente', true),
  ('00000000-0000-0000-0000-000000000005', null, 'technician', 'Técnico',              true),
  ('00000000-0000-0000-0000-000000000006', null, 'finance',    'Financeiro',           true),
  ('00000000-0000-0000-0000-000000000007', null, 'stock',      'Estoquista',           true)
on conflict do nothing;

-- Owner e admin: tudo (via app.is_admin(), não precisa de linhas aqui)

-- Gerente: quase tudo na unidade
insert into public.role_permissions (role_id, permission_key, value_limit)
select '00000000-0000-0000-0000-000000000003', key,
       case key when 'sales.discount' then 30 when 'cash.withdrawal' then 2000 when 'purchases.approve' then 10000 else null end
from public.permissions
where key not in ('admin.roles','admin.stores','fiscal.configure','admin.audit')
on conflict do nothing;

-- Vendedor
insert into public.role_permissions (role_id, permission_key, value_limit) values
  ('00000000-0000-0000-0000-000000000004', 'sales.create', null),
  ('00000000-0000-0000-0000-000000000004', 'sales.discount', 5),
  ('00000000-0000-0000-0000-000000000004', 'cash.open', null),
  ('00000000-0000-0000-0000-000000000004', 'cash.close', null),
  ('00000000-0000-0000-0000-000000000004', 'products.view', null),
  ('00000000-0000-0000-0000-000000000004', 'os.create', null),
  ('00000000-0000-0000-0000-000000000004', 'customers.view', null),
  ('00000000-0000-0000-0000-000000000004', 'customers.manage', null),
  ('00000000-0000-0000-0000-000000000004', 'crm.message', null)
on conflict do nothing;

-- Técnico
insert into public.role_permissions (role_id, permission_key) values
  ('00000000-0000-0000-0000-000000000005', 'os.create'),
  ('00000000-0000-0000-0000-000000000005', 'os.diagnose'),
  ('00000000-0000-0000-0000-000000000005', 'os.quote'),
  ('00000000-0000-0000-0000-000000000005', 'products.view'),
  ('00000000-0000-0000-0000-000000000005', 'customers.view')
on conflict do nothing;

-- Financeiro
insert into public.role_permissions (role_id, permission_key) values
  ('00000000-0000-0000-0000-000000000006', 'finance.view'),
  ('00000000-0000-0000-0000-000000000006', 'finance.receivables'),
  ('00000000-0000-0000-0000-000000000006', 'finance.payables'),
  ('00000000-0000-0000-0000-000000000006', 'finance.reconcile'),
  ('00000000-0000-0000-0000-000000000006', 'finance.dre'),
  ('00000000-0000-0000-0000-000000000006', 'reports.view'),
  ('00000000-0000-0000-0000-000000000006', 'reports.export'),
  ('00000000-0000-0000-0000-000000000006', 'customers.view'),
  ('00000000-0000-0000-0000-000000000006', 'dashboard.view'),
  ('00000000-0000-0000-0000-000000000006', 'dashboard.view_money')
on conflict do nothing;

-- Estoquista
insert into public.role_permissions (role_id, permission_key) values
  ('00000000-0000-0000-0000-000000000007', 'products.view'),
  ('00000000-0000-0000-0000-000000000007', 'products.manage'),
  ('00000000-0000-0000-0000-000000000007', 'stock.entry'),
  ('00000000-0000-0000-0000-000000000007', 'stock.transfer'),
  ('00000000-0000-0000-0000-000000000007', 'stock.inventory')
on conflict do nothing;

-- ---------- Bootstrap: cria empresa + 1ª loja e torna o usuário owner ----------
create or replace function app.create_company(
  p_company_name text,
  p_store_name   text default 'Loja principal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_store   uuid;
  v_user    uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if (select company_id from public.profiles where id = v_user) is not null then
    raise exception 'Usuário já pertence a uma empresa';
  end if;

  insert into public.companies (name) values (p_company_name) returning id into v_company;
  insert into public.stores (company_id, name) values (v_company, p_store_name) returning id into v_store;

  update public.profiles set company_id = v_company where id = v_user;
  insert into public.user_stores (user_id, store_id, role_id)
  values (v_user, v_store, '00000000-0000-0000-0000-000000000001');

  -- Formas de pagamento padrão
  insert into public.payment_methods (company_id, kind, name, days_to_receive) values
    (v_company, 'cash',   'Dinheiro', 0),
    (v_company, 'pix',    'Pix', 0),
    (v_company, 'debit',  'Cartão de débito', 1),
    (v_company, 'credit', 'Cartão de crédito à vista', 30),
    (v_company, 'credit_installments', 'Cartão de crédito parcelado', 30),
    (v_company, 'credit_plan', 'Crediário próprio', 0);

  -- Modelos de mensagem padrão
  insert into public.message_templates (company_id, key, name, body, auto_on_status) values
    (v_company, 'os_opened',       'OS aberta',            'Olá {{nome}}! Recebemos seu aparelho. Acompanhe sua OS #{{numero_os}} em: {{link}}', 'open'),
    (v_company, 'quote_ready',     'Orçamento pronto',     'Olá {{nome}}! O orçamento da OS #{{numero_os}} ficou pronto: {{valor}}. Aprove em: {{link}}', 'awaiting_approval'),
    (v_company, 'os_ready',        'Aparelho pronto',      'Boa notícia, {{nome}}! Seu aparelho está pronto para retirada. OS #{{numero_os}}.', 'ready'),
    (v_company, 'pickup_reminder', 'Lembrete de retirada', 'Olá {{nome}}, seu aparelho da OS #{{numero_os}} está pronto e aguardando retirada.', null),
    (v_company, 'billing',         'Cobrança',             'Olá {{nome}}, sua parcela de {{valor}} vence em {{data}}. Pague pelo Pix: {{pix}}', null),
    (v_company, 'post_sale',       'Pós-venda',            'Olá {{nome}}! Tudo certo com sua compra? Conte com a gente. 😊', null);

  -- Termos padrão (placeholder para editar nas configurações)
  insert into public.terms (company_id, kind, version, body) values
    (v_company, 'service_term',  1, 'Termo de serviço padrão — edite em Configurações.'),
    (v_company, 'warranty_term', 1, 'Termo de garantia padrão (90 dias) — edite em Configurações.'),
    (v_company, 'exchange_policy', 1, 'Política de troca: 7 dias para arrependimento — edite em Configurações.');

  -- Categorias financeiras básicas
  insert into public.finance_categories (company_id, name, kind) values
    (v_company, 'Venda de produtos', 'revenue'),
    (v_company, 'Serviços de assistência', 'revenue'),
    (v_company, 'CMV', 'cost'),
    (v_company, 'Peças aplicadas em OS', 'cost'),
    (v_company, 'Despesas operacionais', 'expense'),
    (v_company, 'Despesas administrativas', 'expense');

  -- Centros de custo
  insert into public.cost_centers (company_id, name) values
    (v_company, 'Loja'), (v_company, 'Assistência'), (v_company, 'Administrativo');

  -- Caixa físico da loja
  insert into public.accounts (company_id, store_id, name, type) values
    (v_company, v_store, 'Caixa da loja', 'cash');

  return v_company;
end;
$$;

grant execute on function app.create_company(text, text) to authenticated;
grant usage on schema app to authenticated;
grant execute on function app.next_store_number(uuid, text) to authenticated;
