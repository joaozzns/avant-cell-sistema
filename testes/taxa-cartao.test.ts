/**
 * Taxa de cartão: a diferença entre o que a maquininha combinou e o que
 * descontou. Sem a taxa combinada gravada na venda, a conciliação aceita
 * qualquer desconto — era o que acontecia enquanto não havia onde cadastrar.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  alterar, apagar, caixaAberto, centavos, chamar, contexto, criarProduto,
  inserir, limpar, marca, porEstoque, um, vender,
} from "./apoio.ts";

let loja = "", empresa = "", sessao = "", produto = "";
let credito = "", parcelado = "";
let guardaCredito = 0, guardaParcelado = 0;
const etiqueta = marca();

before(async () => {
  ({ loja, empresa } = await contexto());
  sessao = await caixaAberto(loja);
  produto = await criarProduto(`${etiqueta} produto`, 1000, 400);
  await porEstoque(loja, produto, 20);

  const c = await um<{ id: string; fee_percent: number }>(
    "payment_methods?kind=eq.credit&select=id,fee_percent&limit=1");
  const p = await um<{ id: string; fee_percent: number }>(
    "payment_methods?kind=eq.credit_installments&select=id,fee_percent&limit=1");
  credito = c.id; parcelado = p.id;
  guardaCredito = Number(c.fee_percent); guardaParcelado = Number(p.fee_percent);

  await alterar("payment_methods", `id=eq.${credito}`, { fee_percent: 3.19, days_to_receive: 30 });
  await alterar("payment_methods", `id=eq.${parcelado}`, {
    fee_percent: 3.79, days_to_receive: 30,
    installments: [{ n: 6, fee_percent: 4.49, days: 30 }],
  });
});

after(async () => {
  await alterar("payment_methods", `id=eq.${credito}`, { fee_percent: guardaCredito });
  await alterar("payment_methods", `id=eq.${parcelado}`, { fee_percent: guardaParcelado });
  await apagar("card_settlements", `import_batch=like.${etiqueta}*`);
  await limpar();
});

test("venda no crédito guarda a taxa combinada, o líquido e a data prevista", async () => {
  const venda = await vender({
    loja, sessao, produto, qtd: 1, preco: 1000,
    formas: [{ kind: "credit", amount: 1000 }],
  });
  const pg = await um<{ fee_percent: number; net_amount: number; expected_date: string }>(
    `sale_payments?sale_id=eq.${venda.sale_id}&select=fee_percent,net_amount,expected_date`);

  assert.equal(centavos(Number(pg.fee_percent)), 3.19);
  assert.equal(centavos(Number(pg.net_amount)), 968.10, "líquido é o bruto menos a taxa");
  assert.ok(pg.expected_date, "a venda já sabe em que dia o dinheiro cai");
});

test("parcelado usa a taxa da faixa de parcelas, não a taxa base", async () => {
  const venda = await vender({
    loja, sessao, produto, qtd: 1, preco: 1200,
    formas: [{ kind: "credit_installments", amount: 1200 }],
  });
  // a fábrica manda 1 parcela; aqui o que importa é a faixa, então vendemos em 6x
  const em6 = await chamar("complete_sale", {
    p: {
      store_id: loja, cash_session_id: sessao, discount: 0,
      items: [{ product_id: produto, qty: 1, unit_price: 1200, discount: 0 }],
      payments: [{ kind: "credit_installments", amount: 1200, installments: 6, change_given: 0 }],
    },
  });
  assert.equal(em6.erro, undefined);

  const pg = await um<{ fee_percent: number; net_amount: number }>(
    `sale_payments?sale_id=eq.${em6.dados.sale_id}&select=fee_percent,net_amount`);
  assert.equal(centavos(Number(pg.fee_percent)), 4.49, "6x tem taxa própria");
  assert.equal(centavos(Number(pg.net_amount)), 1146.12);
  assert.ok(venda.sale_id);
});

test("conciliação acusa quando a maquininha desconta mais do que o combinado", async () => {
  const venda = await vender({
    loja, sessao, produto, qtd: 1, preco: 1000,
    formas: [{ kind: "credit", amount: 1000 }],
  });
  assert.ok(venda.sale_id);

  const lote = `${etiqueta}-diverge`;
  await inserir("card_settlements", {
    company_id: empresa, store_id: loja, acquirer: `${etiqueta} adquirente`,
    gross: 1000, fee: 45, net: 955, expected_date: new Date().toISOString().slice(0, 10),
    import_batch: lote, status: "pending", raw: {},
  });

  const r = await chamar("card_reconcile", { p: { store_id: loja, import_batch: lote } });
  assert.equal(r.erro, undefined);
  assert.equal(r.dados.divergentes, 1, "4,50% cobrado contra 3,19% combinado tem que acusar");

  const linha = await um<{ status: string }>(
    `card_settlements?import_batch=eq.${lote}&select=status`);
  assert.equal(linha.status, "divergent");
});

test("taxa dentro do combinado é conciliada sem alarme falso", async () => {
  const venda = await vender({
    loja, sessao, produto, qtd: 1, preco: 500,
    formas: [{ kind: "credit", amount: 500 }],
  });
  assert.ok(venda.sale_id);

  const lote = `${etiqueta}-ok`;
  await inserir("card_settlements", {
    company_id: empresa, store_id: loja, acquirer: `${etiqueta} adquirente`,
    gross: 500, fee: 15.95, net: 484.05, expected_date: new Date().toISOString().slice(0, 10),
    import_batch: lote, status: "pending", raw: {},
  });

  const r = await chamar("card_reconcile", { p: { store_id: loja, import_batch: lote } });
  assert.equal(r.dados.casados, 1);
  assert.equal(r.dados.divergentes, 0, "3,19% cobrado sobre 500 é exatamente o combinado");
});

test("forma sem taxa cadastrada não inventa desconto", async () => {
  const venda = await vender({
    loja, sessao, produto, qtd: 1, preco: 300,
    formas: [{ kind: "pix", amount: 300 }],
  });
  const pg = await um<{ fee_percent: number; net_amount: number }>(
    `sale_payments?sale_id=eq.${venda.sale_id}&select=fee_percent,net_amount`);
  assert.equal(centavos(Number(pg.fee_percent)), 0);
  assert.equal(centavos(Number(pg.net_amount)), 300);
});

test("taxa de uma forma não vaza para outra", async () => {
  // débito não tem taxa cadastrada neste teste; crédito tem 3,19%
  const venda = await vender({
    loja, sessao, produto, qtd: 1, preco: 200,
    formas: [{ kind: "debit", amount: 200 }],
  });
  const pg = await um<{ fee_percent: number; net_amount: number }>(
    `sale_payments?sale_id=eq.${venda.sale_id}&select=fee_percent,net_amount`);
  assert.equal(centavos(Number(pg.fee_percent)), 0, "a taxa do crédito não pode cair no débito");
  assert.equal(centavos(Number(pg.net_amount)), 200);
});
