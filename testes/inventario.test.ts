/**
 * Inventário: contagem e fechamento.
 *
 * No fechamento o saldo do sistema passa a ser o que foi contado — é o único
 * lugar do sistema onde um número digitado substitui o estoque inteiro sem
 * passar por venda ou entrada. Por isso a contagem precisa ser desconfiada.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  contexto, criarProduto, porEstoque, buscar, um, chamar, limpar, marca, apagar,
} from "./apoio.ts";

let loja = "", produto = "", inventario = "", itemInv = "";
const SALDO = 12;

before(async () => {
  const c = await contexto();
  loja = c.loja;
  produto = await criarProduto(`${marca()} inventario`, 50, 20);
  await porEstoque(loja, produto, SALDO);

  const aberto = await buscar<{ id: string }>(
    `inventories?store_id=eq.${loja}&status=in.(open,counting,review)&select=id`);
  assert.equal(aberto.length, 0,
    "há um inventário em andamento nesta loja; feche antes de rodar o teste");

  const { dados, erro } = await chamar("inventory_open", { p: { store_id: loja } });
  assert.equal(erro, undefined);
  inventario = dados.inventory_id;

  itemInv = (await um<{ id: string }>(
    `inventory_items?inventory_id=eq.${inventario}&product_id=eq.${produto}&select=id`)).id;
});

after(async () => {
  if (inventario) {
    await apagar("inventory_items", `inventory_id=eq.${inventario}`);
    await apagar("inventories", `id=eq.${inventario}`);
  }
  await apagar("stock_adjustments", `product_id=eq.${produto}`);
  await apagar("stock_movements", `product_id=eq.${produto}`);
  await apagar("stock_items", `product_id=eq.${produto}`);
  await limpar();
});

const contar = (itens: unknown[]) =>
  chamar("inventory_count", { p: { inventory_id: inventario, items: itens } });

test("a foto do inventário guarda o saldo do sistema", async () => {
  const it = await um<{ system_qty: number }>(
    `inventory_items?id=eq.${itemInv}&select=system_qty`);
  assert.equal(Number(it.system_qty), SALDO);
});

test("contagem negativa é recusada", async () => {
  const { erro } = await contar([{ item_id: itemInv, qty: -3 }]);
  assert.match(String(erro), /negativa/i);

  const it = await um<{ counted_qty: number | null }>(
    `inventory_items?id=eq.${itemInv}&select=counted_qty`);
  assert.equal(it.counted_qty, null, "não podia ter gravado nada");
});

test("item de outro inventário é recusado", async () => {
  const { erro } = await contar([
    { item_id: "00000000-0000-0000-0000-000000000000", qty: 1 },
  ]);
  assert.match(String(erro), /não pertence/i);
});

test("primeira contagem grava, a segunda vira recontagem", async () => {
  const { erro } = await contar([{ item_id: itemInv, qty: 10 }]);
  assert.equal(erro, undefined);
  let it = await um<{ counted_qty: number; second_count: number | null }>(
    `inventory_items?id=eq.${itemInv}&select=counted_qty,second_count`);
  assert.equal(Number(it.counted_qty), 10);
  assert.equal(it.second_count, null);

  await contar([{ item_id: itemInv, qty: 9 }]);
  it = await um(`inventory_items?id=eq.${itemInv}&select=counted_qty,second_count`);
  assert.equal(Number(it.counted_qty), 10, "a primeira contagem não pode ser reescrita");
  assert.equal(Number(it.second_count), 9);
});

test("fechamento ajusta o saldo pela recontagem e deixa documento", async () => {
  const { dados, erro } = await chamar("inventory_close", { p: { inventory_id: inventario } });
  assert.equal(erro, undefined);
  assert.ok(Number(dados.ajustes) >= 1);

  const estoque = await um<{ qty: number }>(
    `stock_items?product_id=eq.${produto}&store_id=eq.${loja}&select=qty`);
  assert.equal(Number(estoque.qty), 9, "o saldo passa a ser o que foi contado");

  const ajuste = await um<{ qty: number; type: string; value_impact: number }>(
    `stock_adjustments?product_id=eq.${produto}&select=qty,type,value_impact`);
  assert.equal(ajuste.type, "adjustment_out");
  assert.equal(Number(ajuste.qty), 3);
  assert.equal(Number(ajuste.value_impact), -60);

  const de_novo = await chamar("inventory_close", { p: { inventory_id: inventario } });
  assert.match(String(de_novo.erro), /já foi fechado/i);
});
