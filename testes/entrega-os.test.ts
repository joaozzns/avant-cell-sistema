/**
 * Entrega de OS: a segunda porta do caixa.
 *
 * O PDV ganhou trava de valores em 25/09/2026, mas a entrega de OS tem a
 * própria cópia do laço de pagamentos e ficou para trás: numa OS de R$ 100,
 * um pagamento em dinheiro de R$ 1.000 com um pix de -R$ 900 fechava a conta
 * e colocava R$ 1.000 na gaveta.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  contexto, caixaAberto, dinheiroEsperado, chamar, inserir, buscar, um,
  descartar, limpar, marca, apagar, centavos,
} from "./apoio.ts";

let loja = "", empresa = "", usuario = "", sessao = "", cliente = "";
const etiqueta = marca();
const vendas: string[] = [];
const ordens: string[] = [];

before(async () => {
  const c = await contexto();
  loja = c.loja; empresa = c.empresa; usuario = c.usuario;
  sessao = await caixaAberto(loja);
  const cl = await inserir<{ id: string }>("customers", {
    company_id: empresa, name: `${etiqueta} dono do aparelho`,
  });
  cliente = cl.id;
  descartar("customers", `id=eq.${cliente}`);
});

after(async () => {
  for (const v of vendas) {
    await apagar("cash_movements", `ref_id=eq.${v}`);
    await apagar("commission_entries", `sale_id=eq.${v}`);
    await apagar("fiscal_documents", `sale_id=eq.${v}`);
    await apagar("sale_payments", `sale_id=eq.${v}`);
    await apagar("sale_items", `sale_id=eq.${v}`);
  }
  for (const o of ordens) await apagar("service_orders", `id=eq.${o}`);
  for (const v of vendas) await apagar("sales", `id=eq.${v}`);
  await limpar();
});

/** OS sem reparo, com taxa de diagnóstico: o caminho mais curto até a entrega. */
async function osParaEntregar(taxa: number) {
  const { dados: numero } = await chamar("next_store_number", {
    p_store: loja, p_kind: "service_order",
  });
  const os = await inserir<{ id: string }>("service_orders", {
    company_id: empresa, store_id: loja, number: numero, customer_id: cliente,
    reported_issue: `${etiqueta} não liga`, created_by: usuario,
    status: "unrepaired", diagnosis_fee: taxa,
  });
  ordens.push(os.id);
  return os.id;
}

const entregar = (osId: string, pagamentos: unknown[]) =>
  chamar("deliver_os", { p: { os_id: osId, delivered_to: etiqueta, payments: pagamentos } });

test("pagamento negativo não infla a gaveta na entrega", async () => {
  const os = await osParaEntregar(100);
  const antes = await dinheiroEsperado(sessao);

  const r = await entregar(os, [
    { kind: "cash", amount: 1000, installments: 1, change_given: 0 },
    { kind: "pix", amount: -900, installments: 1, change_given: 0 },
  ]);
  assert.match(String(r.erro), /valor de pagamento/i);
  assert.equal(centavos(await dinheiroEsperado(sessao)), centavos(antes));
});

test("troco só existe em dinheiro, também na entrega", async () => {
  const os = await osParaEntregar(100);
  const r = await entregar(os, [
    { kind: "pix", amount: 150, installments: 1, change_given: 50 },
  ]);
  assert.match(String(r.erro), /troco.*dinheiro/i);
});

test("troco maior que o recebido é recusado", async () => {
  const os = await osParaEntregar(100);
  const r = await entregar(os, [
    { kind: "cash", amount: 100, installments: 1, change_given: 150 },
  ]);
  assert.match(String(r.erro), /troco maior/i);
});

test("entrega honesta cobra a taxa, entra no caixa e fecha a OS", async () => {
  const os = await osParaEntregar(100);
  const antes = await dinheiroEsperado(sessao);

  const { dados, erro } = await entregar(os, [
    { kind: "cash", amount: 120, installments: 1, change_given: 20 },
  ]);
  assert.equal(erro, undefined);
  assert.equal(centavos(Number(dados.total)), 100);
  vendas.push(dados.sale_id);

  assert.equal(centavos(await dinheiroEsperado(sessao)), centavos(antes + 100),
    "entram os R$ 100 da taxa, não os R$ 120 recebidos");

  const depois = await um<{ status: string; sale_id: string; charged_diagnosis: boolean }>(
    `service_orders?id=eq.${os}&select=status,sale_id,charged_diagnosis`);
  assert.equal(depois.status, "delivered");
  assert.equal(depois.sale_id, dados.sale_id);
  assert.equal(depois.charged_diagnosis, true);

  const venda = await um<{ source: string; total: number }>(
    `sales?id=eq.${dados.sale_id}&select=source,total`);
  assert.equal(venda.source, "os");
  assert.equal(centavos(Number(venda.total)), 100);
});

test("OS já entregue não é entregue de novo", async () => {
  const entregues = await buscar<{ id: string }>(
    `service_orders?status=eq.delivered&select=id&limit=1`);
  if (!entregues.length) return;
  const r = await entregar(entregues[0].id, [
    { kind: "cash", amount: 10, installments: 1, change_given: 0 },
  ]);
  assert.match(String(r.erro), /precisa estar pronta|sem reparo/i);
});
