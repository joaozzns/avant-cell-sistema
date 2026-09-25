/**
 * Ajuste de estoque e fechamento de caixa: as duas portas por onde some
 * mercadoria e dinheiro sem deixar rastro.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  buscar, caixaAberto, centavos, chamar, contexto, criarProduto, limpar,
  marca, porEstoque, um,
} from "./apoio.ts";

let loja = "", sessao = "", produto = "";
const etiqueta = marca();

before(async () => {
  ({ loja } = await contexto());
  sessao = await caixaAberto(loja);
  produto = await criarProduto(`${etiqueta} item`, 100, 40);
  await porEstoque(loja, produto, 10);
});

after(limpar);

test("não dá para tirar do estoque mais do que existe", async () => {
  const r = await chamar("stock_adjust", {
    p_store: loja, p_product: produto, p_variant: null,
    p_qty: -9999, p_type: "loss", p_reason: "sumiu da prateleira",
  });
  assert.ok(r.erro, "tirar 9999 de um estoque de 10 tem que ser recusado");
  assert.match(String(r.erro), /maior que o estoque/i);

  const saldo = await um<{ qty: number }>(
    `stock_items?store_id=eq.${loja}&product_id=eq.${produto}&select=qty`);
  assert.equal(centavos(Number(saldo.qty)), 10, "recusa não mexe no saldo");
});

test("ajuste sem motivo escrito é recusado", async () => {
  const r = await chamar("stock_adjust", {
    p_store: loja, p_product: produto, p_variant: null,
    p_qty: -1, p_type: "loss", p_reason: "",
  });
  assert.ok(r.erro);
  assert.match(String(r.erro), /motivo/i);
});

test("ajuste válido baixa o estoque e vira documento com valor", async () => {
  const r = await chamar("stock_adjust", {
    p_store: loja, p_product: produto, p_variant: null,
    p_qty: -2, p_type: "breakage", p_reason: "Caiu e quebrou no balcão",
  });
  assert.equal(r.erro, undefined);

  const saldo = await um<{ qty: number }>(
    `stock_items?store_id=eq.${loja}&product_id=eq.${produto}&select=qty`);
  assert.equal(centavos(Number(saldo.qty)), 8);

  const registros = await buscar<{ qty: number; reason: string; value_impact: number }>(
    `stock_adjustments?product_id=eq.${produto}&select=qty,reason,value_impact`);
  assert.equal(registros.length, 1, "todo ajuste precisa virar documento revisável");
  assert.equal(centavos(Number(registros[0].value_impact)), -80, "2 unidades a R$ 40 de custo");
  assert.match(registros[0].reason, /quebrou/i);
});

test("gaveta não fecha com valor negativo", async () => {
  const r = await chamar("cash_close", {
    p_session: sessao, p_counted: { cash: -500 }, p_justification: "teste",
  });
  assert.ok(r.erro, "dinheiro contado negativo não existe");
  assert.match(String(r.erro), /negativo/i);

  const caixa = await um<{ status: string }>(`cash_sessions?id=eq.${sessao}&select=status`);
  assert.equal(caixa.status, "open", "a recusa não pode fechar o caixa");
});

test("fechar caixa exige dizer quanto foi contado", async () => {
  const r = await chamar("cash_close", {
    p_session: sessao, p_counted: {}, p_justification: null,
  });
  assert.ok(r.erro);
  assert.match(String(r.erro), /contado/i);
});
