/**
 * Contas e formatações que decidem valor na tela. Não falam com o banco:
 * rodam em qualquer lugar, em menos de um segundo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { brl, fmtDate, isoLocal, parseDecimal } from "../src/lib/format.ts";
import { preencher, telefoneWhatsApp } from "../src/lib/mensagens.ts";
import { rotuloPagamento } from "../src/lib/pagamentos.ts";
import { atrasado, diasCorridos } from "../src/lib/externo.ts";
import { vencida } from "../src/lib/reservas.ts";
import { imeiValido } from "../src/lib/imei.ts";

test("valor digitado no padrão brasileiro vira número certo", () => {
  assert.equal(parseDecimal("1.234,56"), 1234.56);
  assert.equal(parseDecimal("89,90"), 89.9);
  assert.equal(parseDecimal("1.599"), 1599);
  assert.equal(parseDecimal("0"), 0);
  assert.equal(parseDecimal("abc"), 0, "texto sem número não pode virar NaN em campo de dinheiro");
  assert.equal(parseDecimal(null), 0);
});

test("dinheiro sai formatado em real", () => {
  assert.match(brl(1234.5), /R\$\s?1\.234,50/);
  assert.match(brl(0), /R\$\s?0,00/);
});

test("data pura não anda um dia para trás", () => {
  // "2026-09-25" lido como UTC vira 24/09 no Brasil: era o defeito de
  // vencimento, prazo e garantia em todo o sistema
  assert.equal(fmtDate("2026-09-25"), "25/09/2026");
  assert.equal(fmtDate("2026-01-01"), "01/01/2026");
  assert.equal(fmtDate(null), "—");
});

test("hoje é o hoje de quem está na loja, não o de Londres", () => {
  const agora = new Date();
  const esperado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  assert.equal(isoLocal(), esperado);
});

test("modelo de mensagem: variável conhecida some, desconhecida fica visível", () => {
  const corpo = "Olá {{nome}}, sua parcela de {{valor}} vence em {{data}}.";
  const texto = preencher(corpo, { nome: "Ana", valor: "" });
  assert.match(texto, /Olá Ana/);
  assert.ok(!texto.includes("{{valor}}"), "variável conhecida e vazia sai do texto");
  assert.ok(texto.includes("{{data}}"), "variável que o sistema não preenche fica à vista do atendente");
});

test("telefone vira número de WhatsApp ou recusa", () => {
  assert.equal(telefoneWhatsApp("(11) 98433-4677"), "5511984334677");
  assert.equal(telefoneWhatsApp("5511984334677"), "5511984334677");
  assert.equal(telefoneWhatsApp("98433-4677"), null, "sem DDD o sistema não chuta");
  assert.equal(telefoneWhatsApp(""), null);
});

test("forma de pagamento nunca aparece como código", () => {
  assert.equal(rotuloPagamento("store_credit"), "Crédito na loja");
  assert.equal(rotuloPagamento("credit_plan"), "Crediário");
  assert.equal(rotuloPagamento("cash"), "Dinheiro");
  assert.ok(!rotuloPagamento("forma_nova_qualquer").includes("_"), "forma desconhecida sai legível");
});

test("prazo do laboratório externo", () => {
  /* datas montadas no fuso de quem usa: "ontem em UTC" às 23h no Brasil ainda
     é hoje aqui, e o teste passaria a mentir dependendo da hora em que roda */
  const ontem = isoLocal(new Date(Date.now() - 86400000));
  const amanha = isoLocal(new Date(Date.now() + 86400000));
  assert.equal(atrasado(ontem, "in_repair"), true);
  assert.equal(atrasado(amanha, "in_repair"), false);
  assert.equal(atrasado(ontem, "received"), false, "aparelho que já voltou não está atrasado");
  assert.equal(diasCorridos(new Date(Date.now() - 3 * 86400000).toISOString()), 3);
});

test("reserva vencida só conta enquanto está em aberto", () => {
  const ontem = isoLocal(new Date(Date.now() - 86400000));
  assert.equal(vencida(ontem, "available"), true);
  assert.equal(vencida(ontem, "delivered"), false);
  assert.equal(vencida(null, "available"), false);
});

test("IMEI passa pela validação do dígito verificador", () => {
  assert.equal(imeiValido("352099001761481"), true);
  assert.equal(imeiValido("352099001761482"), false, "um dígito trocado tem que reprovar");
  assert.equal(imeiValido("12345"), false);
});

test("erro do banco chega inteiro na tela", async () => {
  const { mensagemDoBanco } = await import("../src/lib/erro-banco.ts");
  assert.equal(
    mensagemDoBanco("Cliente bloqueado para novas compras a prazo: cheque devolvido"),
    "Cliente bloqueado para novas compras a prazo: cheque devolvido",
    "a frase não pode ser cortada nos dois-pontos",
  );
  assert.equal(mensagemDoBanco("P0001: Caixa fechado"), "Caixa fechado", "código SQL sai");
  assert.match(
    mensagemDoBanco('new row violates row-level security policy for table "sales"'),
    /permissão/i, "erro de RLS vira frase que o lojista entende");
  assert.match(
    mensagemDoBanco("duplicate key value violates unique constraint \"uq_x\""),
    /já existe/i);
  assert.equal(mensagemDoBanco(""), "Não deu para completar a operação.");
});
