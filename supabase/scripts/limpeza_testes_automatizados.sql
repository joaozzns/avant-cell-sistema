-- Limpeza dos dados criados pela suíte automatizada (testes/).
--
-- Os testes criam tudo com nome começando em ZZTESTE e apagam no fim, mas o
-- que já virou documento (venda, movimento de estoque, comissão) não sai por
-- DELETE simples: o banco protege a integridade. O resultado é que o volume
-- de teste se acumula e contamina o painel do dia, o faturamento e o estoque.
--
-- Este script tira essa camada inteira, na ordem que o banco aceita. Roda
-- inteiro, de uma vez, no SQL Editor. Pode rodar de novo quando quiser.

begin;

create temp table _prod on commit drop as
  select id from public.products where name like 'ZZTESTE%';

create temp table _venda on commit drop as
  select distinct s.id
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
   where si.product_id in (select id from _prod);

create temp table _cliente on commit drop as
  select id from public.customers where name like 'ZZTESTE%';

-- ---------- 1. o que pendura na venda ----------
delete from public.commission_entries where sale_id in (select id from _venda);
delete from public.sale_return_items
 where return_id in (select id from public.sale_returns where sale_id in (select id from _venda));
delete from public.sale_returns where sale_id in (select id from _venda)
   or exchange_sale_id in (select id from _venda);
delete from public.fiscal_documents where sale_id in (select id from _venda);
delete from public.campaign_sends where sale_id in (select id from _venda);
update public.quotes set converted_sale_id = null where converted_sale_id in (select id from _venda);
update public.reservations set sale_id = null where sale_id in (select id from _venda);
update public.service_orders set sale_id = null where sale_id in (select id from _venda);

-- crediário gerado nas vendas de teste
update public.receivables set renegotiated_from = null
 where renegotiated_from in (select id from public.receivables
                              where sale_id in (select id from _venda)
                                 or customer_id in (select id from _cliente));
delete from public.receivables where sale_id in (select id from _venda)
   or customer_id in (select id from _cliente);

-- crédito de loja nascido de devolução de teste
delete from public.store_credits where customer_id in (select id from _cliente);

delete from public.sale_payments where sale_id in (select id from _venda);
delete from public.sale_items where sale_id in (select id from _venda);
delete from public.sales where id in (select id from _venda);

-- ---------- 2. estoque e seus documentos ----------
delete from public.stock_movements where product_id in (select id from _prod);
delete from public.stock_adjustments where product_id in (select id from _prod);
delete from public.stock_entry_items where product_id in (select id from _prod);
delete from public.transfer_items where product_id in (select id from _prod);
delete from public.inventory_items where product_id in (select id from _prod);
delete from public.serialized_units where product_id in (select id from _prod);
delete from public.stock_items where product_id in (select id from _prod);
delete from public.purchase_order_items where product_id in (select id from _prod);
delete from public.price_history where product_id in (select id from _prod);
delete from public.supplier_prices where product_id in (select id from _prod);
delete from public.product_models where product_id in (select id from _prod);
delete from public.product_variants where product_id in (select id from _prod);
delete from public.reservations where product_id in (select id from _prod);
delete from public.products where id in (select id from _prod);

-- ---------- 3. clientes de teste ----------
delete from public.messages where customer_id in (select id from _cliente);
delete from public.campaign_sends where customer_id in (select id from _cliente);
delete from public.customer_credit_profiles where customer_id in (select id from _cliente);
delete from public.customer_devices where customer_id in (select id from _cliente);
delete from public.lgpd_requests where customer_id in (select id from _cliente);
delete from public.surveys where customer_id in (select id from _cliente);
delete from public.appointments where customer_id in (select id from _cliente);
delete from public.quotes where customer_id in (select id from _cliente);
delete from public.customers where id in (select id from _cliente);

-- ---------- 4. caixa: entradas e saídas que ficaram sem documento ----------
-- Sem isto o caixa fica devendo: as entradas das vendas de teste saíram junto
-- com as vendas, mas as saídas (devolução em dinheiro, compra de usado)
-- continuariam lá, e o esperado do fechamento vira um número negativo.
delete from public.cash_movements m
 where m.ref_id is not null
   and not exists (select 1 from public.sales s         where s.id = m.ref_id)
   and not exists (select 1 from public.sale_returns r  where r.id = m.ref_id)
   and not exists (select 1 from public.receivables v   where v.id = m.ref_id)
   and not exists (select 1 from public.reservations e  where e.id = m.ref_id)
   and not exists (select 1 from public.trade_ins t     where t.id = m.ref_id)
   and not exists (select 1 from public.store_credits c where c.id = m.ref_id);

-- ---------- 5. fornecedores e pedidos de teste ----------
delete from public.payables
 where po_id in (select id from public.purchase_orders
                  where supplier_id in (select id from public.suppliers where name like 'ZZTESTE%'));
delete from public.purchase_orders
 where supplier_id in (select id from public.suppliers where name like 'ZZTESTE%');
delete from public.suppliers where name like 'ZZTESTE%';

commit;

-- Conferência: as três primeiras têm que voltar zeradas, e o caixa positivo.
--   select count(*) from public.products  where name like 'ZZTESTE%';
--   select count(*) from public.customers where name like 'ZZTESTE%';
--   select count(*) from public.sales s join public.sale_items i on i.sale_id = s.id
--     join public.products p on p.id = i.product_id where p.name like 'ZZTESTE%';
--   select (public.cash_expected(id) ->> 'cash')::numeric
--     from public.cash_sessions where status = 'open';
