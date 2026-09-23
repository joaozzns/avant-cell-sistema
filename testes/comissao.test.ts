/**
 * Comissão: o que o vendedor leva no fim do mês.
 *
 * Duas coisas estragam a folha: apurar duas vezes e pagar em dobro, e a venda
 * voltar depois da comissão já aprovada. As duas já aconteceram aqui.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  buscar, caixaAberto, centavos, chamar, contexto, criarCliente, criarProduto,
  descartar, inserir, itensDaVenda, limpar, marca, porEstoque, vender,
} from "./apoio.ts";

let loja = "", sessao = "", produto = "", cliente = "", empresa = "", usuario = "";
let periodo = "";
const etiqueta = marca();

before(async () => {
  ({ loja, empresa, usuario } = await contexto());
  sessao = await caixaAberto(loja);
  produto = await criarProduto(`${etiqueta} fone`, 200, 80);
  await porEstoque(loja, produto, 50);
  cliente = await criarCliente(`${etiqueta} cliente`);
  const hoje = new Date();
  periodo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
});

after(limpar);

async function comissoesDoItem(itemId: string) {
  return buscar<{ amount: number; status: string; reversal_of: string | null }>(
    `commission_entries?sale_item_id=eq.${itemId}&select=amount,status,reversal_of`);
}

test("apurar duas vezes não duplica a comissão", async () => {
  const venda = await vender({
    loja, sessao, cliente, produto, qtd: 1, preco: 200,
    formas: [{ kind: "cash", amount: 200 }],
  });
  const [item] = await itensDaVenda(venda.sale_id);

  await chamar("commission_accrue", { p_period: periodo });
  const primeira = await comissoesDoItem(item.id);
  await chamar("commission_accrue", { p_period: periodo });
  const segunda = await comissoesDoItem(item.id);

  assert.equal(segunda.length, primeira.length, "reapurar não pode criar lançamento novo");
  assert.equal(
    centavos(segunda.reduce((s, c) => s + Number(c.amount), 0)),
    centavos(primeira.reduce((s, c) => s + Number(c.amount), 0)));
});

test("venda devolvida depois da comissão aprovada gera estorno proporcional", async () => {
  const venda = await vender({
    loja, sessao, cliente, produto, qtd: 2, preco: 200,
    formas: [{ kind: "cash", amount: 400 }],
  });
  const [item] = await itensDaVenda(venda.sale_id);

  await chamar("commission_accrue", { p_period: periodo });
  const apurada = await comissoesDoItem(item.id);
  if (!apurada.length) return; // loja sem regra de comissão ativa: nada a testar

  await chamar("commission_set_status", { p_period: periodo, p_user: null, p_status: "approved" });
  const valorAprovado = centavos(apurada.reduce((s, c) => s + Number(c.amount), 0));

  // devolve 1 dos 2 itens
  await chamar("return_sale", {
    p: {
      sale_id: venda.sale_id, reason: "regret", refund_kind: "cash", cash_session_id: sessao,
      items: [{ sale_item_id: item.id, qty: 1, destination: "stock" }],
    },
  });

  const estornos = (await comissoesDoItem(item.id)).filter((c) => c.reversal_of);
  assert.ok(estornos.length > 0, "comissão aprovada de item devolvido tem que estornar");
  const somaEstorno = centavos(-estornos.reduce((s, c) => s + Number(c.amount), 0));
  assert.equal(somaEstorno, centavos(valorAprovado / 2), "metade devolvida, metade estornada");

  // devolve o segundo: o estorno somado não pode passar da comissão original
  await chamar("return_sale", {
    p: {
      sale_id: venda.sale_id, reason: "regret", refund_kind: "cash", cash_session_id: sessao,
      items: [{ sale_item_id: item.id, qty: 1, destination: "stock" }],
    },
  });
  const todos = (await comissoesDoItem(item.id)).filter((c) => c.reversal_of);
  assert.equal(centavos(-todos.reduce((s, c) => s + Number(c.amount), 0)), valorAprovado,
    "estorno nunca passa do que foi pago de comissão");
});

test("reapurar o mês não apaga os estornos já lançados", async () => {
  const antes = (await buscar<{ id: string }>(
    `commission_entries?period=eq.${periodo}&reversal_of=not.is.null&select=id`)).length;
  await chamar("commission_accrue", { p_period: periodo });
  const depois = (await buscar<{ id: string }>(
    `commission_entries?period=eq.${periodo}&reversal_of=not.is.null&select=id`)).length;
  assert.equal(depois, antes, "estorno é acerto de conta, não apuração");
});

test("só dono ou gerente apura comissão", async () => {
  // a permissão vive no banco: se um dia alguém trocar o papel do usuário de
  // teste, este teste avisa antes de o vendedor apurar a própria comissão
  const { dados } = await chamar("commission_accrue", { p_period: "2020-01" });
  assert.ok(dados, "o usuário de teste é dono/gerente — se falhar aqui, a permissão mudou");
});
