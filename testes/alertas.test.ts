/**
 * Central de alertas: o sistema avisa sozinho e para de avisar quando o
 * problema acaba. Alerta que não some vira ruído e o dono deixa de olhar.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  alterar, apagar, buscar, chamar, contexto, criarProduto, limpar, marca, porEstoque, um,
} from "./apoio.ts";

let loja = "", produto = "", estoque = "";
const etiqueta = marca();

before(async () => {
  ({ loja } = await contexto());
  produto = await criarProduto(`${etiqueta} peça`, 50, 20);
  // entra já abaixo do mínimo: é o gatilho do alerta de estoque
  estoque = await porEstoque(loja, produto, 1);
  await alterar("stock_items", `id=eq.${estoque}`, { min_qty: 5 });
});

after(async () => {
  await apagar("alerts", `ref_id=eq.${estoque}`);
  await limpar();
});

test("estoque abaixo do mínimo vira alerta", async () => {
  const r = await chamar("alerts_refresh", { p: { store_id: loja } });
  assert.equal(r.erro, undefined);

  const alerta = await um<{ kind: string; severity: string; title: string; status: string }>(
    `alerts?ref_id=eq.${estoque}&select=kind,severity,title,status`);
  assert.equal(alerta.kind, "low_stock");
  assert.equal(alerta.status, "open");
  assert.match(alerta.title, new RegExp(etiqueta));
});

test("rodar de novo não duplica o alerta", async () => {
  await chamar("alerts_refresh", { p: { store_id: loja } });
  await chamar("alerts_refresh", { p: { store_id: loja } });
  const linhas = await buscar<{ id: string }>(`alerts?ref_id=eq.${estoque}&select=id`);
  assert.equal(linhas.length, 1, "o mesmo problema não pode virar três avisos");
});

test("repor o estoque resolve o alerta sozinho", async () => {
  await alterar("stock_items", `id=eq.${estoque}`, { qty: 50 });
  const r = await chamar("alerts_refresh", { p: { store_id: loja } });
  assert.ok(Number(r.dados.resolvidos) >= 1);

  const alerta = await um<{ status: string; resolved_at: string | null }>(
    `alerts?ref_id=eq.${estoque}&select=status,resolved_at`);
  assert.equal(alerta.status, "resolved");
  assert.ok(alerta.resolved_at, "guarda quando deixou de ser problema");
});

test("problema que volta gera alerta novo", async () => {
  await alterar("stock_items", `id=eq.${estoque}`, { qty: 1 });
  await chamar("alerts_refresh", { p: { store_id: loja } });
  const abertos = await buscar<{ id: string }>(
    `alerts?ref_id=eq.${estoque}&status=eq.open&select=id`);
  assert.equal(abertos.length, 1, "acabou o estoque de novo, avisa de novo");
});

test("alerta adiado não reaparece antes da hora, e volta depois", async () => {
  const alerta = await um<{ id: string }>(
    `alerts?ref_id=eq.${estoque}&status=eq.open&select=id`);

  const daquiUmaSemana = new Date(Date.now() + 7 * 86400000).toISOString();
  await alterar("alerts", `id=eq.${alerta.id}`, { status: "snoozed", snooze_until: daquiUmaSemana });
  await chamar("alerts_refresh", { p: { store_id: loja } });
  let atual = await um<{ status: string }>(`alerts?id=eq.${alerta.id}&select=status`);
  assert.equal(atual.status, "snoozed", "adiar tem que valer até a data escolhida");

  await alterar("alerts", `id=eq.${alerta.id}`, { snooze_until: new Date(Date.now() - 3600000).toISOString() });
  await chamar("alerts_refresh", { p: { store_id: loja } });
  atual = await um<{ status: string }>(`alerts?id=eq.${alerta.id}&select=status`);
  assert.equal(atual.status, "open", "passou o prazo, o problema volta para a lista");
});
