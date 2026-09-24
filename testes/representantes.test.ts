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
  alterar, apagar, buscar, centavos, chamar, comoAnonimo, contexto, descartar,
  inserir, limpar, marca, tentarAlterar, um, URL_API,
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

test("sem ser da equipe, o negócio do dono não responde", async () => {
  /* a política destas tabelas é app.is_staff(): sem ela, nada volta — nem para
     quem tem a chave pública do projeto na mão */
  const reps = await comoAnonimo("partners?select=name");
  const assinaturas = await comoAnonimo("subscriptions?select=monthly_amount");
  const config = await comoAnonimo("partner_settings?select=commission_kind");

  assert.deepEqual(reps.corpo, [], "quem não é equipe não vê representante");
  assert.deepEqual(assinaturas.corpo, [], "nem quanto cada loja paga");
  assert.deepEqual(config.corpo, [], "nem a regra de comissão");
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

test("ninguém muda os próprios poderes editando o perfil", async () => {
  /* o ataque é direto: um PATCH em profiles. A política de RLS deixa cada um
     mexer na própria linha, e linha não é coluna — por isso a proteção é
     privilégio por coluna, e é isso que este teste vigia. */
  const promover = await tentarAlterar("profiles", `id=eq.${usuario}`, { is_staff: true });
  assert.equal(promover.ok, false, "virar equipe Avant Cell sozinho tem que ser recusado");
  assert.equal(promover.status, 403);

  const trocarEmpresa = await tentarAlterar("profiles", `id=eq.${usuario}`, { company_id: null });
  assert.equal(trocarEmpresa.ok, false, "mudar de empresa sozinho tem que ser recusado");

  const reativar = await tentarAlterar("profiles", `id=eq.${usuario}`, { active: true });
  assert.equal(reativar.ok, false, "quem foi desligado não se reativa");

  /* o que é da pessoa continua editável */
  const nome = await tentarAlterar("profiles", `id=eq.${usuario}`, { full_name: "Conta de Teste" });
  assert.equal(nome.ok, true, "nome próprio continua editável");
});


