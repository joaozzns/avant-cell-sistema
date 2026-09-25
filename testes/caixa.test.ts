/**
 * Caixa: o que o sistema diz que tem que estar na gaveta.
 *
 * Fechamento cego compara o que o operador contou com o que o sistema espera.
 * Se a conta do esperado erra, a loja acusa sobra ou falta de um funcionário
 * honesto — foi o que aconteceu com o recebimento em espécie.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  apagar, caixaAberto, centavos, contexto, descartar, dinheiroEsperado, inserir, limpar,
  marca, tentarInserir,
} from "./apoio.ts";

let loja = "";
let usuario = "";
let sessao = "";
const etiqueta = marca();

before(async () => {
  ({ loja, usuario } = await contexto());
  sessao = await caixaAberto(loja);
});

after(async () => {
  await apagar("cash_movements", `reason=like.${etiqueta}*`);
  await limpar();
});

async function movimento(tipo: string, valor: number) {
  const m = await inserir<{ id: string }>("cash_movements", {
    session_id: sessao, store_id: loja, type: tipo, amount: valor,
    reason: `${etiqueta} ${tipo}`, user_id: usuario,
  });
  descartar("cash_movements", `id=eq.${m.id}`);
  return m.id;
}

test("suprimento entra e sangria sai do esperado", async () => {
  const antes = await dinheiroEsperado(sessao);
  await movimento("supply", 100);
  assert.equal(await dinheiroEsperado(sessao), centavos(antes + 100));
  await movimento("withdrawal", 30);
  assert.equal(await dinheiroEsperado(sessao), centavos(antes + 70));
});

test("estorno de devolução sai do esperado", async () => {
  const antes = await dinheiroEsperado(sessao);
  await movimento("refund", 40);
  assert.equal(await dinheiroEsperado(sessao), centavos(antes - 40),
    "estorno em dinheiro sai da gaveta e precisa sair do esperado");
});

test("parcela e sinal recebidos em espécie entram no esperado", async () => {
  const antes = await dinheiroEsperado(sessao);
  await movimento("receivable_payment", 250);
  assert.equal(await dinheiroEsperado(sessao), centavos(antes + 250),
    "dinheiro que entra sem ser venda também é dinheiro na gaveta");
});

/* ---------------------------------------------------------------------------
 * O que não pode sair da gaveta
 *
 * Até 25/09/2026 nada disso era conferido: a tela de caixa insere direto em
 * cash_movements e a política de segurança só pergunta se a pessoa trabalha
 * naquela loja. Uma sangria de R$ 999.999,00 num caixa com R$ 2.659,50 foi
 * aceita numa sondagem, e o esperado foi para -R$ 997.339,50.
 * ------------------------------------------------------------------------- */

const tentarMovimento = (dados: Record<string, unknown>) =>
  tentarInserir("cash_movements", { session_id: sessao, store_id: loja, user_id: usuario, ...dados });

test("não sai da gaveta mais do que tem nela", async () => {
  const tem = await dinheiroEsperado(sessao);
  const r = await tentarMovimento({
    type: "withdrawal", amount: tem + 1000, reason: `${etiqueta} sangria grande`,
  });
  assert.ok(r.erro, "sangria maior que o caixa tem que ser recusada");
  assert.match(String(r.erro), /o caixa tem/i);
  assert.equal(await dinheiroEsperado(sessao), centavos(tem), "recusa não mexe no esperado");
});

test("estorno também respeita o que existe na gaveta", async () => {
  const tem = await dinheiroEsperado(sessao);
  const r = await tentarMovimento({
    type: "refund", amount: tem + 500, reason: `${etiqueta} estorno grande`,
  });
  assert.ok(r.erro);
  assert.match(String(r.erro), /o caixa tem/i);
});

test("movimento de valor zero ou negativo é recusado", async () => {
  for (const valor of [0, -50]) {
    const r = await tentarMovimento({
      type: "supply", amount: valor, reason: `${etiqueta} valor ${valor}`,
    });
    assert.ok(r.erro, `valor ${valor} tinha que ser recusado`);
    assert.match(String(r.erro), /maior que zero/i);
  }
});

test("caixa fechado não recebe movimento", async () => {
  const fechada = await inserir<{ id: string }>("cash_sessions", {
    company_id: (await contexto()).empresa, store_id: loja, opened_by: usuario,
    status: "closed", opening_amount: 0, closed_at: new Date().toISOString(),
  });
  descartar("cash_sessions", `id=eq.${fechada.id}`);

  const r = await tentarInserir("cash_movements", {
    session_id: fechada.id, store_id: loja, user_id: usuario,
    type: "supply", amount: 10, reason: `${etiqueta} caixa fechado`,
  });
  assert.ok(r.erro, "movimento em caixa fechado tem que ser recusado");
  assert.match(String(r.erro), /já foi fechado/i);
});
