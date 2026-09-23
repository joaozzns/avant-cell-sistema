/**
 * Regras que seguram produto e dinheiro fora do caixa: reserva com sinal,
 * aparelho no laboratório de terceiro e compra de usado.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  buscar, caixaAberto, centavos, chamar, contexto, criarCliente, descartar,
  inserir, limpar, marca, um,
} from "./apoio.ts";

let loja = "", empresa = "", usuario = "", sessao = "", cliente = "";
let modelo = "", unidade = "";
const etiqueta = marca();

/** IMEI com dígito verificador correto, gerado na hora para não repetir. */
function imeiValidoQualquer() {
  const base = String(Math.floor(Math.random() * 1e14)).padStart(14, "0");
  let soma = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(base[13 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    soma += d;
  }
  return base + String((10 - (soma % 10)) % 10);
}

before(async () => {
  ({ loja, empresa, usuario } = await contexto());
  sessao = await caixaAberto(loja);
  cliente = await criarCliente(`${etiqueta} cliente`);

  const p = await inserir<{ id: string }>("products", {
    company_id: empresa, name: `${etiqueta} aparelho`, type: "device",
    sale_price: 2000, cost: 1500, avg_cost: 1500, track_stock: true, serialized: true, active: true,
  });
  modelo = p.id;
  descartar("products", `id=eq.${modelo}`);

  const u = await inserir<{ id: string }>("serialized_units", {
    company_id: empresa, store_id: loja, product_id: modelo, imei1: imeiValidoQualquer(),
    condition: "new", status: "available", origin: "purchase", cost: 1500, sale_price: 2000,
  });
  unidade = u.id;
  descartar("serialized_units", `id=eq.${unidade}`);
});

after(limpar);

/* ---------------- reserva ---------------- */

test("reserva sem cliente não existe", async () => {
  const { erro } = await chamar("reservation_create", { p: { store_id: loja, unit_id: unidade } });
  assert.ok(erro, "sinal sem dono é dinheiro sem dono");
});

test("sinal em dinheiro vira crédito do cliente e entra no caixa", async () => {
  const { dados, erro } = await chamar("reservation_create", {
    p: {
      store_id: loja, customer_id: cliente, unit_id: unidade, agreed_price: 2000,
      deposit_amount: 300, deposit_kind: "cash", session_id: sessao,
      pickup_deadline: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    },
  });
  assert.equal(erro, undefined);
  descartar("reservations", `id=eq.${dados.id}`);

  const unidadeDepois = await um<{ status: string }>(`serialized_units?id=eq.${unidade}&select=status`);
  assert.equal(unidadeDepois.status, "reserved", "aparelho reservado sai da vitrine");

  const creditos = await buscar<{ balance: number }>(
    `store_credits?origin=eq.deposit&origin_id=eq.${dados.id}&select=balance`);
  assert.equal(centavos(Number(creditos[0]?.balance ?? 0)), 300);

  const movimentos = await buscar<{ amount: number; type: string }>(
    `cash_movements?ref_id=eq.${dados.id}&select=amount,type`);
  assert.equal(movimentos[0]?.type, "receivable_payment");
  assert.equal(centavos(Number(movimentos[0]?.amount ?? 0)), 300);
});

test("mesmo aparelho não pode ser reservado duas vezes", async () => {
  const { erro } = await chamar("reservation_create", {
    p: { store_id: loja, customer_id: cliente, unit_id: unidade },
  });
  assert.ok(erro, "aparelho já reservado não pode ser prometido a outro cliente");
});

test("reter o sinal exige motivo e só toca o sinal daquela reserva", async () => {
  const reserva = await um<{ id: string }>(
    `reservations?customer_id=eq.${cliente}&status=eq.available&select=id&limit=1`);

  const semMotivo = await chamar("reservation_update", {
    p: { id: reserva.id, status: "canceled", forfeit_deposit: true },
  });
  assert.ok(semMotivo.erro, "ficar com dinheiro do cliente sem justificar é o começo do problema");

  const comMotivo = await chamar("reservation_update", {
    p: {
      id: reserva.id, status: "canceled", forfeit_deposit: true,
      reason: "Cliente desistiu apos o prazo combinado",
    },
  });
  assert.equal(comMotivo.erro, undefined);
  assert.equal(centavos(Number(comMotivo.dados.sinal_retido)), 300);

  const credito = await buscar<{ balance: number }>(
    `store_credits?origin=eq.deposit&origin_id=eq.${reserva.id}&select=balance`);
  assert.equal(centavos(Number(credito[0]?.balance ?? 0)), 0);

  const unidadeDepois = await um<{ status: string }>(`serialized_units?id=eq.${unidade}&select=status`);
  assert.equal(unidadeDepois.status, "available", "reserva encerrada devolve o aparelho para a venda");
});

/* ---------------- laboratório externo ---------------- */

test("aparelho no laboratório: situação não volta atrás e a conta é lançada uma vez", async () => {
  const numero = await chamar("next_store_number", { p_store: loja, p_kind: "service_order" });
  const os = await inserir<{ id: string }>("service_orders", {
    company_id: empresa, store_id: loja, number: numero.dados, customer_id: cliente,
    reported_issue: `${etiqueta} teste de laboratorio`, created_by: usuario, status: "open",
  });
  descartar("service_orders", `id=eq.${os.id}`);

  const envio = await chamar("os_external_send", {
    p: { os_id: os.id, partner_name: `${etiqueta} microsolda`, agreed_cost: 180 },
  });
  assert.equal(envio.erro, undefined);

  const duplicado = await chamar("os_external_send", {
    p: { os_id: os.id, partner_name: "outro lab" },
  });
  assert.ok(duplicado.erro, "um aparelho não está em dois laboratórios ao mesmo tempo");

  await chamar("os_external_update", { p: { id: envio.dados.id, status: "in_analysis" } });
  const voltaAtras = await chamar("os_external_update", { p: { id: envio.dados.id, status: "sent" } });
  assert.ok(voltaAtras.erro, "situação do envio não anda para trás");

  const recebido = await chamar("os_external_update", {
    p: { id: envio.dados.id, status: "received", cost: 230 },
  });
  assert.equal(recebido.erro, undefined);
  assert.equal(centavos(Number(recebido.dados.cost_external)), 230, "custo do parceiro entra na OS");

  const filtro = encodeURIComponent(`*OS #${numero.dados} *`);   // "#" cru corta a URL
  const contas = await buscar<{ amount: number }>(
    `payables?description=like.${filtro}&select=amount`);
  assert.equal(contas.length, 1, "a conta do parceiro é lançada uma vez só");
  assert.equal(centavos(Number(contas[0].amount)), 230);
  descartar("payables", `description=like.${filtro}`);

  const denovo = await chamar("os_external_update", {
    p: { id: envio.dados.id, status: "received", cost: 230 },
  });
  assert.ok(denovo.erro, "envio encerrado não aceita novo recebimento");
});

/* ---------------- compra de usado ---------------- */

test("compra de aparelho usado exige conferência de IMEI e recusa bloqueado", async () => {
  const comum = {
    store_id: loja, product_id: modelo, brand: "Apple", model: "iPhone teste",
    seller_name: "Vendedor de Teste", seller_cpf: "52998224725",
    doc_photo_url: `${empresa}/trade-in/teste/doc.png`,
    paid_amount: 500, payment_kind: "cash", cash_session_id: sessao,
  };

  const semConferir = await chamar("register_trade_in", {
    p: { ...comum, imei: imeiValidoQualquer() },
  });
  assert.ok(semConferir.erro, "comprar sem conferir a base de bloqueio é comprar aparelho roubado");

  const bloqueado = await chamar("register_trade_in", {
    p: {
      ...comum, imei: imeiValidoQualquer(),
      imei_check: { situacao: "bloqueado", fonte: "conferencia_manual", consultado_em: new Date().toISOString() },
    },
  });
  assert.ok(bloqueado.erro);
  assert.match(String(bloqueado.erro), /bloqueado/i);

  const imeiRuim = await chamar("register_trade_in", {
    p: {
      ...comum, imei: "111111111111111",
      imei_check: { situacao: "livre", fonte: "conferencia_manual", consultado_em: new Date().toISOString() },
    },
  });
  assert.ok(imeiRuim.erro, "IMEI com dígito errado não entra no estoque");

  const livre = await chamar("register_trade_in", {
    p: {
      ...comum, imei: imeiValidoQualquer(),
      imei_check: { situacao: "livre", fonte: "conferencia_manual", consultado_em: new Date().toISOString() },
    },
  });
  assert.equal(livre.erro, undefined);
  descartar("trade_ins", `id=eq.${livre.dados.trade_in_id}`);
  descartar("serialized_units", `id=eq.${livre.dados.unit_id}`);
  descartar("stock_movements", `unit_id=eq.${livre.dados.unit_id}`);
  descartar("cash_movements", `ref_id=eq.${livre.dados.trade_in_id}`);
});
