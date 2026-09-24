/**
 * Representantes do Avant Cell: quem vende o sistema para as lojas.
 *
 * Aqui há dois riscos: um lojista enxergar o negócio do dono (quanto cada loja
 * paga, quanto o representante ganha) e a comissão aparecer com número
 * inventado antes de o modelo ser escolhido.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  alterar, apagar, buscar, centavos, chamar, contexto, descartar, inserir,
  limpar, marca, um, URL_API,
} from "./apoio.ts";

let empresa = "", usuario = "";
let parceiro = "", token = "";
let eraStaff = false;
let assinaturaAnterior: { company_id: string; partner_id: string | null; monthly_amount: number; status: string } | null = null;
const etiqueta = marca();

async function painel(tk: string) {
  const fs = await import("node:fs");
  const chave = fs.readFileSync(".env.local", "utf8")
    .match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)![1].trim();
  const r = await fetch(`${URL_API}/rest/v1/rpc/partner_panel`, {
    method: "POST",
    headers: { apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: tk }),
  });
  return r.json();
}

before(async () => {
  ({ empresa, usuario } = await contexto());
  const eu = await um<{ is_staff: boolean }>(`profiles?id=eq.${usuario}&select=is_staff`);
  eraStaff = eu.is_staff;
  await alterar("profiles", `id=eq.${usuario}`, { is_staff: true });

  const p = await inserir<{ id: string; token: string }>("partners", { name: `${etiqueta} representante` });
  parceiro = p.id; token = p.token;
  descartar("partners", `id=eq.${parceiro}`);

  /* uma empresa tem uma assinatura só: guardo a que existir e devolvo no fim,
     senão o teste briga com o cadastro de verdade */
  const atual = await buscar<{ company_id: string; partner_id: string | null; monthly_amount: number; status: string }>(
    `subscriptions?company_id=eq.${empresa}&select=company_id,partner_id,monthly_amount,status`);
  assinaturaAnterior = atual[0] ?? null;
  await apagar("subscriptions", `company_id=eq.${empresa}`);
});

after(async () => {
  await apagar("subscriptions", `company_id=eq.${empresa}`);
  if (assinaturaAnterior) await inserir("subscriptions", assinaturaAnterior);
  await alterar("partner_settings", "id=eq.true",
    { commission_kind: null, percent: null, fixed_amount: null });
  await limpar();
  await chamar("staff_set", { p_user: usuario, p_flag: eraStaff });
});

test("link inválido não abre carteira nenhuma", async () => {
  const r = await painel("00000000-0000-4000-8000-000000000000");
  assert.equal(r.erro, "link inválido");
  assert.equal(r.carteira, undefined);
});

test("a carteira soma só as lojas que estão pagando", async () => {
  await inserir("subscriptions", {
    company_id: empresa, partner_id: parceiro, monthly_amount: 199, status: "active",
  });
  const p = await painel(token);
  assert.equal(p.carteira.ativas, 1);
  assert.equal(centavos(Number(p.carteira.mrr)), 199);

  await alterar("subscriptions", `company_id=eq.${empresa}`, { status: "canceled" });
  const depois = await painel(token);
  assert.equal(depois.carteira.ativas, 0, "loja cancelada sai da conta");
  assert.equal(centavos(Number(depois.carteira.mrr)), 0);

  await alterar("subscriptions", `company_id=eq.${empresa}`, { status: "active" });
});

test("sem modelo definido, o painel não inventa comissão", async () => {
  await alterar("partner_settings", "id=eq.true",
    { commission_kind: null, percent: null, fixed_amount: null });
  const p = await painel(token);
  assert.equal(p.comissao.definido, false);
  assert.match(String(p.comissao.texto), /não foi definido/i);
  assert.equal(p.comissao.mes, undefined, "nenhum número enquanto a regra não existe");
});

test("percentual recorrente calcula sobre a mensalidade", async () => {
  await alterar("partner_settings", "id=eq.true",
    { commission_kind: "recurring_percent", percent: 20, fixed_amount: null });
  const p = await painel(token);
  assert.equal(p.comissao.definido, true);
  assert.equal(centavos(Number(p.comissao.mes)), 39.8, "20% de 199");
});

test("valor fixo conta as lojas ativadas no mês", async () => {
  await alterar("partner_settings", "id=eq.true",
    { commission_kind: "fixed_per_store", fixed_amount: 150, percent: null });
  const p = await painel(token);
  assert.equal(centavos(Number(p.comissao.mes)), 150);
});

test("lojista não enxerga o negócio do dono", async () => {
  await alterar("profiles", `id=eq.${usuario}`, { is_staff: false });

  const reps = await buscar(`partners?select=name`);
  const assinaturas = await buscar(`subscriptions?select=monthly_amount`);
  const config = await buscar(`partner_settings?select=commission_kind`);

  assert.equal(reps.length, 0, "quem não é equipe não vê representante");
  assert.equal(assinaturas.length, 0, "nem quanto cada loja paga");
  assert.equal(config.length, 0, "nem a regra de comissão");

  await alterar("profiles", `id=eq.${usuario}`, { is_staff: true });
});

test("trocar o link derruba o anterior", async () => {
  const r = await chamar("partner_link_rotate", { p_partner: parceiro });
  assert.equal(r.erro, undefined);
  const antigo = await painel(token);
  assert.equal(antigo.erro, "link inválido");
  token = r.dados.token as string;
  const novo = await painel(token);
  assert.equal(novo.erro, undefined);
});

test("usuário comum não se promove a equipe Avant Cell", async () => {
  await alterar("profiles", `id=eq.${usuario}`, { is_staff: false });

  /* pela função: tem que recusar */
  const pelaFuncao = await chamar("staff_set", { p_user: usuario, p_flag: true });
  assert.ok(pelaFuncao.erro, "promover a si mesmo sem ser da equipe tem que ser recusado");

  /* pela API, editando o próprio perfil: é o caminho que estava aberto */
  try {
    await alterar("profiles", `id=eq.${usuario}`, { is_staff: true });
    const depois = await um<{ is_staff: boolean }>(`profiles?id=eq.${usuario}&select=is_staff`);
    assert.equal(depois.is_staff, false,
      "editar o próprio perfil não pode conceder acesso ao negócio da Avant Cell");
  } finally {
    await alterar("profiles", `id=eq.${usuario}`, { is_staff: eraStaff });
  }
});

test("trocar de empresa pelo próprio perfil não pode", async () => {
  const antes = await um<{ company_id: string }>(`profiles?id=eq.${usuario}&select=company_id`);
  try {
    await alterar("profiles", `id=eq.${usuario}`, { company_id: null });
    const depois = await um<{ company_id: string }>(`profiles?id=eq.${usuario}&select=company_id`);
    assert.equal(depois.company_id, antes.company_id, "ninguém muda de empresa sozinho");
  } finally {
    /* se a proteção ainda não estiver no banco, devolve o vínculo na marra:
       teste de segurança não pode deixar a base quebrada atrás de si */
    await alterar("profiles", `id=eq.${usuario}`, { company_id: antes.company_id });
  }
});
