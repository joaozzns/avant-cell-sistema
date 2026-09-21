-- Índices para as consultas das telas novas.
--
-- O verificador do Supabase apontou 188 chaves estrangeiras sem índice. Com o
-- banco vazio nada disso aparece; com uma loja de verdade (milhares de vendas
-- por mês) as telas de comissão, conciliação, devolução, transferência e
-- inventário passam a varrer tabela inteira.
--
-- Aqui vão só os índices que essas telas realmente usam.

-- devolução
create index if not exists ix_sale_return_items_return   on public.sale_return_items (return_id);
create index if not exists ix_sale_return_items_item     on public.sale_return_items (sale_item_id);
create index if not exists ix_sale_returns_store         on public.sale_returns (store_id, created_at desc);

-- crédito na loja (saldo do cliente)
create index if not exists ix_store_credits_saldo        on public.store_credits (company_id, customer_id) where balance > 0;

-- comissão e metas
create index if not exists ix_commission_periodo         on public.commission_entries (company_id, period, status);
create index if not exists ix_commission_item            on public.commission_entries (sale_item_id);
create index if not exists ix_commission_os              on public.commission_entries (os_id);
create index if not exists ix_sales_vendedor_periodo     on public.sales (company_id, seller_id, completed_at desc);
create index if not exists ix_sale_items_produto         on public.sale_items (product_id);

-- conciliação de cartão
create index if not exists ix_card_settlements_pagamento on public.card_settlements (sale_payment_id);
create index if not exists ix_card_settlements_lote      on public.card_settlements (company_id, import_batch, status);

-- transferência entre lojas
create index if not exists ix_transfer_items_produto     on public.transfer_items (product_id);
create index if not exists ix_transfer_items_unidade     on public.transfer_items (unit_id);
create index if not exists ix_transfers_destino          on public.transfers (to_store, status);

-- inventário
create index if not exists ix_inventory_items_produto    on public.inventory_items (product_id);

-- usado na troca e movimentação de estoque
create index if not exists ix_trade_ins_empresa          on public.trade_ins (company_id, created_at desc);
create index if not exists ix_stock_movements_unidade    on public.stock_movements (unit_id);
create index if not exists ix_stock_movements_empresa    on public.stock_movements (company_id, created_at desc);

-- OS: anexos e entrega (usada na comissão por OS)
create index if not exists ix_os_attachments_os          on public.os_attachments (os_id);
create index if not exists ix_service_orders_entrega     on public.service_orders (company_id, status, delivered_at);
