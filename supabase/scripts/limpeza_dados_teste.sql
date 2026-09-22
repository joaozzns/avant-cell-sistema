-- Limpeza dos dados criados nos testes de 18 a 22/09/2026.
--
-- Roda uma vez, inteiro, no SQL Editor. Tudo dentro de uma transação: ou sai
-- tudo, ou não sai nada. Os dados de demonstração do dia 13/09 (clientes,
-- produtos, vendas, OS) ficam como estão — o que sai é só o que eu criei
-- testando os módulos novos.
--
-- Devoluções e créditos de loja NÃO são apagados: são movimentos plausíveis de
-- uma loja de verdade e servem de demonstração.

begin;

-- ---------- 1. avisos ao cliente gerados nos testes ----------
delete from public.messages where created_at >= '2026-09-18';

-- ---------- 2. laboratório externo (e a conta a pagar que ele gerou) ----------
-- a conta só pode sair depois do envio que aponta para ela
create temp table _contas_externas on commit drop as
  select payable_id from public.os_external_services where payable_id is not null;

update public.service_orders
   set cost_external = 0
 where id in (select os_id from public.os_external_services);

delete from public.os_external_services;

delete from public.payables where id in (select payable_id from _contas_externas);

delete from public.os_comments
 where created_at >= '2026-09-18'
   and (message like 'Aparelho enviado para %' or message like 'Aparelho recebido de volta de %');

-- ---------- 3. conciliação de cartão ----------
update public.sale_payments
   set net_amount = null
 where id in (select sale_payment_id from public.card_settlements where sale_payment_id is not null);

delete from public.card_settlements;

-- ---------- 4. comissões apuradas em teste ----------
delete from public.commission_entries where created_at >= '2026-09-18';

-- ---------- 5. inventário de teste (devolve as 2 capinhas ajustadas) ----------
update public.stock_items si
   set qty = si.qty + a.qty_total
  from (select store_id, product_id, sum(abs(qty)) as qty_total
          from public.stock_adjustments
         where created_at >= '2026-09-18' and reason ilike '%inventário%'
         group by store_id, product_id) a
 where si.store_id = a.store_id and si.product_id = a.product_id;

delete from public.stock_adjustments
 where created_at >= '2026-09-18' and reason ilike '%inventário%';

delete from public.inventories;   -- inventory_items sai junto (on delete cascade)

-- ---------- 6. aparelhos comprados na troca (usado) ----------
delete from public.stock_movements
 where created_at >= '2026-09-18'
   and (ref_table = 'trade_ins'
        or unit_id in (select id from public.serialized_units where origin = 'trade_in'));

-- trade_ins.unit_id aponta para a unidade: a compra sai primeiro
delete from public.trade_ins;
delete from public.serialized_units where origin = 'trade_in';

-- ---------- 7. transferências e a Loja 2 (teste) ----------
-- o que saiu da loja principal volta para ela
update public.stock_items si
   set qty = si.qty + t.enviado, in_transit = 0
  from (select ti.product_id, sum(ti.qty) as enviado
          from public.transfer_items ti
          join public.transfers tr on tr.id = ti.transfer_id
         where ti.unit_id is null
         group by ti.product_id) t
 where si.product_id = t.product_id
   and si.store_id = (select id from public.stores where name = 'Loja principal');

update public.serialized_units
   set store_id = (select id from public.stores where name = 'Loja principal'),
       status = 'available'
 where id in (select unit_id from public.transfer_items where unit_id is not null);

delete from public.stock_movements
 where created_at >= '2026-09-18' and ref_table = 'transfers';

delete from public.transfer_items;
delete from public.transfers;

delete from public.stock_items
 where store_id in (select id from public.stores where name = 'Loja 2 (teste)');
delete from public.store_counters
 where store_id in (select id from public.stores where name = 'Loja 2 (teste)');
delete from public.user_stores
 where store_id in (select id from public.stores where name = 'Loja 2 (teste)');
delete from public.stores where name = 'Loja 2 (teste)';

-- ---------- 8. dinheiro de teste no caixa ----------
delete from public.cash_movements
 where created_at >= '2026-09-18'
   and (reason ilike '%teste%' or reason ilike '%aparelho usado%');

commit;

-- Conferência rápida depois de rodar:
--   select name from public.stores;                          -- só a Loja principal
--   select count(*) from public.trade_ins;                   -- 0
--   select qty from public.stock_items si join public.products p on p.id = si.product_id
--    where p.name = 'Capinha iPhone 15 silicone';            -- 33
