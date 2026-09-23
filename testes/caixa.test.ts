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
  apagar, caixaAberto, centavos, contexto, descartar, dinheiroEsperado, inserir, limpar, marca,
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
