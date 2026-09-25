/**
 * Os números que entram numa venda.
 *
 * Pela tela ninguém digita quantidade negativa nem troco no pix. Mas a função
 * é chamável direto com o token da própria sessão — qualquer pessoa que já
 * entrou no sistema consegue —, e era por aí que dava para inventar estoque e
 * mexer no que a gaveta recebe sem que a venda mudasse de valor.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  contexto, criarProduto, porEstoque, caixaAberto, dinheiroEsperado,
  um, chamar, limpar, marca, apagar, centavos,
} from "./apoio.ts";

let loja = "", sessao = "", produto = "";
const ESTOQUE = 5, PRECO = 100;

/* a venda que dá certo precisa sair inteira e na ordem: o movimento de caixa
   aponta para ela, e o produto só sai depois que nenhum item o segura */
const vendas: string[] = [];

before(async () => {
  const c = await contexto();
  loja = c.loja;
  sessao = await caixaAberto(loja);
  produto = await criarProduto(`${marca()} venda`, PRECO, 40);
  await porEstoque(loja, produto, ESTOQUE);
});

after(async () => {
  for (const v of vendas) {
    await apagar("cash_movements", `ref_id=eq.${v}`);
    await apagar("commission_entries", `sale_id=eq.${v}`);
    await apagar("fiscal_documents", `sale_id=eq.${v}`);
    await apagar("stock_movements", `ref_id=eq.${v}`);
    await apagar("sale_payments", `sale_id=eq.${v}`);
    await apagar("sale_items", `sale_id=eq.${v}`);
    await apagar("sales", `id=eq.${v}`);
  }
  await apagar("stock_movements", `product_id=eq.${produto}`);
  await apagar("stock_items", `product_id=eq.${produto}`);
  await limpar();
});

const saldo = async () =>
  Number((await um<{ qty: number }>(
    `stock_items?product_id=eq.${produto}&store_id=eq.${loja}&select=qty`)).qty);

function venda(itens: unknown[], pagamentos: unknown[], desconto = 0) {
  return chamar("complete_sale", {
    p: {
      store_id: loja, cash_session_id: sessao, customer_id: null,
      discount: desconto, items: itens, payments: pagamentos,
    },
  });
}

const item = (extra: Record<string, unknown>) => ({
  product_id: produto, unit_id: null, qty: 1, unit_price: PRECO, discount: 0, ...extra,
});
const pgto = (extra: Record<string, unknown>) => ({
  kind: "cash", amount: PRECO, installments: 1, change_given: 0, ...extra,
});

test("quantidade negativa não vira entrada de estoque", async () => {
  const antes = await saldo();
  /* -2 unidades a -R$ 100 dá R$ 200 positivos: os sinais se anulavam no total
     e o estoque subia 2 numa venda */
  const { erro } = await venda(
    [item({ qty: -2, unit_price: -PRECO })], [pgto({ amount: 200 })]);
  assert.match(String(erro), /quantidade/i);
  assert.equal(await saldo(), antes, "estoque não podia ter mudado");
});

test("quantidade zero não vira venda", async () => {
  const { erro } = await venda([item({ qty: 0 })], [pgto({ amount: 0 })]);
  assert.match(String(erro), /quantidade/i);
});

test("preço negativo é recusado", async () => {
  const { erro } = await venda([item({ unit_price: -PRECO })], [pgto({ amount: 100 })]);
  assert.match(String(erro), /preço inválido/i);
});

test("pagamento negativo não infla a gaveta", async () => {
  const antes = await dinheiroEsperado(sessao);
  /* soma fecha com o total de R$ 100, mas entrariam R$ 1.000 em dinheiro */
  const { erro } = await venda([item({})], [
    pgto({ amount: 1000 }),
    pgto({ kind: "pix", amount: -900 }),
  ]);
  assert.match(String(erro), /valor de pagamento/i);
  assert.equal(centavos(await dinheiroEsperado(sessao)), centavos(antes));
});

test("troco só existe em dinheiro", async () => {
  const { erro } = await venda(
    [item({})], [pgto({ kind: "pix", amount: 150, change_given: 50 })]);
  assert.match(String(erro), /troco.*dinheiro/i);
});

test("troco maior que o recebido é recusado", async () => {
  const { erro } = await venda(
    [item({})], [pgto({ amount: 100, change_given: 150 })]);
  assert.match(String(erro), /troco maior/i);
});

test("desconto negativo não é acréscimo disfarçado", async () => {
  const { erro } = await venda([item({})], [pgto({ amount: 150 })], -50);
  assert.match(String(erro), /desconto/i);
});

test("a venda honesta continua passando e o caixa recebe o certo", async () => {
  const estoqueAntes = await saldo();
  const caixaAntes = await dinheiroEsperado(sessao);

  /* R$ 100 pagos com R$ 150 e R$ 50 de troco: entram R$ 100 na gaveta */
  const { dados, erro } = await venda(
    [item({})], [pgto({ amount: 150, change_given: 50 })]);
  assert.equal(erro, undefined);
  assert.equal(centavos(Number(dados.total)), PRECO);
  vendas.push(dados.sale_id);

  assert.equal(await saldo(), estoqueAntes - 1);
  assert.equal(centavos(await dinheiroEsperado(sessao)), centavos(caixaAntes + PRECO));
});
