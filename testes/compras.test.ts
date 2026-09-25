/**
 * Recebimento de pedido de compra.
 *
 * O recebimento mexe em três lugares ao mesmo tempo: estoque, custo médio e
 * conta a pagar. Um número errado aqui não aparece na tela — aparece no
 * inventário do mês seguinte e na fatura do fornecedor.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  contexto, criarProduto, inserir, buscar, um, chamar, descartar, limpar,
  marca, centavos, apagar,
} from "./apoio.ts";

let loja = "", empresa = "", produto = "", pedido = "", item = "";
const PEDIDO = 30, CUSTO = 10;

before(async () => {
  const c = await contexto();
  loja = c.loja; empresa = c.empresa;
  produto = await criarProduto(`${marca()} recebimento`, 40, CUSTO);

  const fornecedores = await buscar<{ id: string }>("suppliers?select=id&limit=1");
  const fornecedor = fornecedores.length
    ? fornecedores[0].id
    : (await inserir<{ id: string }>("suppliers", { company_id: empresa, name: marca() })).id;
  if (!fornecedores.length) descartar("suppliers", `id=eq.${fornecedor}`);

  const { dados: numero } = await chamar("next_store_number", {
    p_store: loja, p_kind: "purchase_order",
  });
  const po = await inserir<{ id: string }>("purchase_orders", {
    company_id: empresa, store_id: loja, supplier_id: fornecedor,
    number: numero, status: "sent", total: PEDIDO * CUSTO,
  });
  pedido = po.id;
  descartar("purchase_orders", `id=eq.${pedido}`);
  const poi = await inserir<{ id: string }>("purchase_order_items", {
    po_id: pedido, product_id: produto, qty: PEDIDO, unit_cost: CUSTO,
  });
  item = poi.id;
  descartar("purchase_order_items", `id=eq.${item}`);
});

after(async () => {
  for (const e of await buscar<{ id: string }>(
    `stock_entries?purchase_order_id=eq.${pedido}&select=id`)) {
    await apagar("payables", `entry_id=eq.${e.id}`);
    await apagar("stock_movements", `ref_id=eq.${e.id}`);
    await apagar("stock_entry_items", `entry_id=eq.${e.id}`);
    await apagar("stock_entries", `id=eq.${e.id}`);
  }
  await apagar("stock_items", `product_id=eq.${produto}`);
  await limpar();
});

const receber = (itens: unknown[], extra: Record<string, unknown> = {}) =>
  chamar("po_receive", { p: { po_id: pedido, items: itens, ...extra } });

test("recebe o que foi pedido: entra no estoque e vira conta a pagar", async () => {
  const { dados, erro } = await receber([
    { item_id: item, qty_received: 20, unit_cost: CUSTO },
  ]);
  assert.equal(erro, undefined);
  assert.equal(centavos(Number(dados.total)), 200);

  const estoque = await um<{ qty: number }>(
    `stock_items?product_id=eq.${produto}&store_id=eq.${loja}&select=qty`);
  assert.equal(Number(estoque.qty), 20);

  const conta = await um<{ amount: number }>(
    `payables?entry_id=eq.${dados.entry_id}&select=amount`);
  assert.equal(centavos(Number(conta.amount)), 200);
});

test("não recebe mais do que foi pedido", async () => {
  const antes = Number((await um<{ qty: number }>(
    `stock_items?product_id=eq.${produto}&store_id=eq.${loja}&select=qty`)).qty);

  /* faltam 10 das 30; tentar 25 tem que ser recusado, não somar 25 no estoque */
  const { erro } = await receber([{ item_id: item, qty_received: 25, unit_cost: CUSTO }]);
  assert.match(String(erro), /faltam/i);

  const depois = Number((await um<{ qty: number }>(
    `stock_items?product_id=eq.${produto}&store_id=eq.${loja}&select=qty`)).qty);
  assert.equal(depois, antes, "estoque não podia ter mudado");
});

test("não recebe quantidade negativa", async () => {
  const { erro } = await receber([{ item_id: item, qty_received: -5, unit_cost: CUSTO }]);
  assert.match(String(erro), /negativa/i);
});

test("não aceita frete negativo", async () => {
  const { erro } = await receber(
    [{ item_id: item, qty_received: 1, unit_cost: CUSTO }], { freight: -100 });
  assert.match(String(erro), /frete/i);
});

test("payload sem quantidade nenhuma não cria entrada vazia", async () => {
  const antes = (await buscar(`stock_entries?purchase_order_id=eq.${pedido}&select=id`)).length;
  /* chave errada de propósito: era assim que nascia uma entrada com total 0 */
  const { erro } = await receber([{ item_id: item, qty: 5, unit_cost: CUSTO }]);
  assert.ok(erro, "devia recusar");
  const depois = (await buscar(`stock_entries?purchase_order_id=eq.${pedido}&select=id`)).length;
  assert.equal(depois, antes, "não podia ter criado documento de entrada");
});

test("lista de itens vazia é recusada", async () => {
  const { erro } = await receber([]);
  assert.match(String(erro), /ao menos um item/i);
});

test("recebendo o restante, o pedido fecha", async () => {
  const { dados, erro } = await receber([
    { item_id: item, qty_received: 10, unit_cost: CUSTO },
  ]);
  assert.equal(erro, undefined);
  assert.equal(dados.fully_received, true);

  const po = await um<{ status: string }>(`purchase_orders?id=eq.${pedido}&select=status`);
  assert.equal(po.status, "received");

  const { erro: erro2 } = await receber([{ item_id: item, qty_received: 1, unit_cost: CUSTO }]);
  assert.match(String(erro2), /já recebido|cancelado/i);
});
