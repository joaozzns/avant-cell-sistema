/**
 * Crediário: vender a prazo é emprestar dinheiro. O sistema vendia sem limite
 * nenhum — qualquer atendente parcelava qualquer valor para qualquer cliente.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  alterar, apagar, buscar, caixaAberto, centavos, chamar, contexto, criarCliente,
  criarProduto, limpar, marca, porEstoque, um, vender,
} from "./apoio.ts";

let loja = "", sessao = "", produto = "", cliente = "";
const etiqueta = marca();

async function situacao() {
  const { dados } = await chamar("credit_status", { p_customer: cliente });
  return {
    limite: Number(dados.limite ?? 0),
    usado: Number(dados.usado ?? 0),
    disponivel: Number(dados.disponivel ?? 0),
    bloqueado: Boolean(dados.bloqueado),
    vencidaEm: dados.vencida_em as string | null,
  };
}

async function venderAPrazo(valor: number, parcelas = 2) {
  return chamar("complete_sale", {
    p: {
      store_id: loja, cash_session_id: sessao, customer_id: cliente, discount: 0,
      items: [{ product_id: produto, qty: 1, unit_price: valor, discount: 0 }],
      payments: [{ kind: "credit_plan", amount: valor, installments: parcelas }],
    },
  });
}

before(async () => {
  ({ loja } = await contexto());
  sessao = await caixaAberto(loja);
  produto = await criarProduto(`${etiqueta} aparelho`, 1000, 500);
  await porEstoque(loja, produto, 30);
  cliente = await criarCliente(`${etiqueta} cliente`);
});

after(async () => {
  await apagar("receivables", `customer_id=eq.${cliente}`);
  await apagar("customer_credit_profiles", `customer_id=eq.${cliente}`);
  await limpar();
});

test("sem limite aprovado, não vende a prazo", async () => {
  const r = await venderAPrazo(600);
  assert.ok(r.erro);
  assert.match(String(r.erro), /sem limite/i);
});

test("gerente aprova o limite e a venda passa", async () => {
  const ok = await chamar("credit_profile_set", {
    p: { customer_id: cliente, credit_limit: 1000, reason: "teste automatizado" },
  });
  assert.equal(ok.erro, undefined);

  const venda = await venderAPrazo(600, 3);
  assert.equal(venda.erro, undefined);

  const s = await situacao();
  assert.equal(centavos(s.limite), 1000);
  assert.equal(centavos(s.usado), 600, "o que está em aberto consome o limite");
  assert.equal(centavos(s.disponivel), 400);

  const parcelas = await buscar<{ amount: number }>(
    `receivables?sale_id=eq.${venda.dados.sale_id}&select=amount`);
  assert.equal(parcelas.length, 3);
  assert.equal(centavos(parcelas.reduce((t, p) => t + Number(p.amount), 0)), 600,
    "as parcelas somam exatamente o valor da venda");
});

test("acima do limite, recusa dizendo quanto sobra", async () => {
  const r = await venderAPrazo(600);
  assert.ok(r.erro);
  assert.match(String(r.erro), /R\$ 400,00/, "a recusa mostra o que ainda cabe");
});

test("pagar parcela devolve limite", async () => {
  const parcela = await um<{ id: string; amount: number }>(
    `receivables?customer_id=eq.${cliente}&status=eq.open&select=id,amount&order=due_date&limit=1`);
  await alterar("receivables", `id=eq.${parcela.id}`,
    { status: "paid", paid_amount: parcela.amount });

  const s = await situacao();
  assert.equal(centavos(s.disponivel), centavos(400 + Number(parcela.amount)));
});

test("parcela vencida trava a venda a prazo", async () => {
  const parcela = await um<{ id: string }>(
    `receivables?customer_id=eq.${cliente}&status=eq.open&select=id&limit=1`);
  await alterar("receivables", `id=eq.${parcela.id}`, { due_date: "2026-01-10" });

  const r = await venderAPrazo(50);
  assert.ok(r.erro);
  assert.match(String(r.erro), /vencida/i);

  await alterar("receivables", `id=eq.${parcela.id}`, { due_date: "2026-12-10" });
});

test("cliente bloqueado não compra a prazo, com o motivo na recusa", async () => {
  await chamar("credit_profile_set", {
    p: {
      customer_id: cliente, credit_limit: 1000, blocked: true,
      blocked_reason: "Cheque devolvido", reason: "teste",
    },
  });
  const r = await venderAPrazo(50);
  assert.ok(r.erro);
  assert.match(String(r.erro), /bloqueado.*Cheque devolvido/i);

  await chamar("credit_profile_set", {
    p: { customer_id: cliente, credit_limit: 1000, blocked: false, reason: "teste" },
  });
});

test("mexer no limite fica na auditoria", async () => {
  const registros = await buscar<{ after: Record<string, unknown>; reason: string | null }>(
    `audit_logs?table_name=eq.customer_credit_profiles&record_id=eq.${cliente}&select=after,reason&order=created_at.desc&limit=1`);
  assert.equal(registros.length, 1);
  assert.equal(Number(registros[0].after.limite), 1000);
});
