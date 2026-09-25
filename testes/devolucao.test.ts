/**
 * Devolução: o que volta para o estoque e o que sai do caixa.
 *
 * O risco aqui não é errar centavo: é o crédito da loja virar dinheiro vivo.
 * Quem compra com crédito e "devolve" em dinheiro está sacando da loja.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  alterar, buscar, caixaAberto, centavos, chamar, contexto, criarCliente, criarProduto,
  dinheiroEsperado, itensDaVenda, limpar, marca, porEstoque, um, vender,
} from "./apoio.ts";

let loja = "", sessao = "", produto = "", cliente = "";
const etiqueta = marca();

before(async () => {
  ({ loja } = await contexto());
  sessao = await caixaAberto(loja);
  produto = await criarProduto(`${etiqueta} capinha`, 100, 40);
  await porEstoque(loja, produto, 50);
  cliente = await criarCliente(`${etiqueta} cliente`);
});

after(limpar);

test("devolver em dinheiro tira do caixa o valor devolvido", async () => {
  const venda = await vender({
    loja, sessao, cliente, produto, qtd: 2, preco: 100,
    formas: [{ kind: "cash", amount: 200 }],
  });
  const [item] = await itensDaVenda(venda.sale_id);
  const antes = await dinheiroEsperado(sessao);

  const { erro } = await chamar("return_sale", {
    p: {
      sale_id: venda.sale_id, reason: "regret", refund_kind: "cash",
      cash_session_id: sessao,
      items: [{ sale_item_id: item.id, qty: 1, destination: "stock" }],
    },
  });
  assert.equal(erro, undefined);
  assert.equal(await dinheiroEsperado(sessao), centavos(antes - 100));
});

test("não devolve mais do que foi vendido", async () => {
  const venda = await vender({
    loja, sessao, cliente, produto, qtd: 1, preco: 100,
    formas: [{ kind: "cash", amount: 100 }],
  });
  const [item] = await itensDaVenda(venda.sale_id);
  const { erro } = await chamar("return_sale", {
    p: {
      sale_id: venda.sale_id, reason: "regret", refund_kind: "cash", cash_session_id: sessao,
      items: [{ sale_item_id: item.id, qty: 5, destination: "stock" }],
    },
  });
  assert.ok(erro, "devolver 5 de uma venda de 1 tem que ser recusado");
});

test("venda paga com crédito na loja não vira dinheiro na devolução", async () => {
  // o cliente ganha crédito devolvendo uma compra e usa o crédito na seguinte
  const primeira = await vender({
    loja, sessao, cliente, produto, qtd: 1, preco: 100,
    formas: [{ kind: "cash", amount: 100 }],
  });
  const [itemPrimeira] = await itensDaVenda(primeira.sale_id);
  await chamar("return_sale", {
    p: {
      sale_id: primeira.sale_id, reason: "regret", refund_kind: "store_credit",
      items: [{ sale_item_id: itemPrimeira.id, qty: 1, destination: "stock" }],
    },
  });

  const segunda = await vender({
    loja, sessao, cliente, produto, qtd: 1, preco: 100,
    formas: [{ kind: "store_credit", amount: 100 }],
  });
  const [itemSegunda] = await itensDaVenda(segunda.sale_id);

  const { erro } = await chamar("return_sale", {
    p: {
      sale_id: segunda.sale_id, reason: "regret", refund_kind: "cash", cash_session_id: sessao,
      items: [{ sale_item_id: itemSegunda.id, qty: 1, destination: "stock" }],
    },
  });
  assert.ok(erro, "devolver em dinheiro uma compra paga com crédito é saque disfarçado");
  assert.match(String(erro), /dinheiro|crédito/i);
});

test("produto devolvido volta para o estoque; avariado não volta", async () => {
  const saldo = async () => Number(
    (await buscar<{ qty: number }>(`stock_items?store_id=eq.${loja}&product_id=eq.${produto}&select=qty`))[0].qty);

  const venda = await vender({
    loja, sessao, cliente, produto, qtd: 2, preco: 100,
    formas: [{ kind: "cash", amount: 200 }],
  });
  const [item] = await itensDaVenda(venda.sale_id);
  const depoisDaVenda = await saldo();

  await chamar("return_sale", {
    p: {
      sale_id: venda.sale_id, reason: "regret", refund_kind: "cash", cash_session_id: sessao,
      items: [{ sale_item_id: item.id, qty: 1, destination: "stock" }],
    },
  });
  assert.equal(await saldo(), depoisDaVenda + 1, "o que volta bom entra no saldo");

  await chamar("return_sale", {
    p: {
      sale_id: venda.sale_id, reason: "defect", refund_kind: "cash", cash_session_id: sessao,
      items: [{ sale_item_id: item.id, qty: 1, destination: "damage" }],
    },
  });
  assert.equal(await saldo(), depoisDaVenda + 1, "avariado não volta para a prateleira");
});

test("não vende o que a loja não tem", async () => {
  const poucos = await criarProduto(`${etiqueta} item escasso`, 100, 40);
  await porEstoque(loja, poucos, 2);

  const r = await chamar("complete_sale", {
    p: {
      store_id: loja, cash_session_id: sessao, discount: 0,
      items: [{ product_id: poucos, qty: 5, unit_price: 100, discount: 0 }],
      payments: [{ kind: "cash", amount: 500, installments: 1, change_given: 0 }],
    },
  });
  assert.ok(r.erro, "vender 5 com 2 em estoque tem que ser recusado");
  assert.match(String(r.erro), /estoque insuficiente/i);

  const saldo = await um<{ qty: number }>(
    `stock_items?store_id=eq.${loja}&product_id=eq.${poucos}&select=qty`);
  assert.equal(centavos(Number(saldo.qty)), 2, "recusa não pode deixar estoque negativo");
});

test("o que está reservado para um cliente não é vendido a outro", async () => {
  const produto2 = await criarProduto(`${etiqueta} item reservado`, 100, 40);
  const linha = await porEstoque(loja, produto2, 3);
  await alterar("stock_items", `id=eq.${linha}`, { reserved: 3 });

  const r = await chamar("complete_sale", {
    p: {
      store_id: loja, cash_session_id: sessao, discount: 0,
      items: [{ product_id: produto2, qty: 1, unit_price: 100, discount: 0 }],
      payments: [{ kind: "cash", amount: 100, installments: 1, change_given: 0 }],
    },
  });
  assert.ok(r.erro, "todas as unidades estão reservadas: não há o que vender");
});
