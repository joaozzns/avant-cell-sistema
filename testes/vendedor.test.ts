/**
 * Painel do vendedor: um link que mostra o que é dele e nada além disso.
 * O link é a credencial — se vazar, não pode servir para espiar a loja.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import {
  alterar, apagar, buscar, caixaAberto, centavos, chamar, contexto, criarProduto,
  inserir, limpar, marca, porEstoque, um, URL_API, vender,
} from "./apoio.ts";

let loja = "", empresa = "", usuario = "", sessao = "", produto = "";
let tokenMeu = "", eraPrincipal = false;
const etiqueta = marca();

/** O painel roda sem sessão: é assim que o vendedor abre no celular dele. */
async function painel(token: string) {
  const chave = (await import("node:fs")).readFileSync(".env.local", "utf8")
    .match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)![1].trim();
  const r = await fetch(`${URL_API}/rest/v1/rpc/seller_panel`, {
    method: "POST",
    headers: { apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  return r.json();
}

before(async () => {
  ({ loja, empresa, usuario } = await contexto());
  sessao = await caixaAberto(loja);
  produto = await criarProduto(`${etiqueta} produto`, 300, 100);
  await porEstoque(loja, produto, 30);

  const eu = await um<{ seller_token: string; primary_seller: boolean }>(
    `profiles?id=eq.${usuario}&select=seller_token,primary_seller`);
  tokenMeu = eu.seller_token;
  eraPrincipal = eu.primary_seller;
  await chamar("seller_set_primary", { p_user: usuario, p_flag: false });
});

after(async () => {
  await chamar("seller_set_primary", { p_user: usuario, p_flag: eraPrincipal });
  await limpar();
});

test("link inválido não abre painel nenhum", async () => {
  const r = await painel("00000000-0000-4000-8000-000000000000");
  assert.equal(r.erro, "link inválido");
  assert.equal(r.vendedor, undefined, "não pode vazar nome nem número");
});

test("o painel mostra o que o vendedor vendeu no mês", async () => {
  const antes = await painel(tokenMeu);
  await vender({ loja, sessao, produto, qtd: 1, preco: 300, formas: [{ kind: "cash", amount: 300 }] });
  const depois = await painel(tokenMeu);

  assert.equal(depois.mes.vendas, antes.mes.vendas + 1);
  assert.equal(centavos(Number(depois.mes.total)), centavos(Number(antes.mes.total) + 300));
  assert.equal(centavos(Number(depois.hoje.total)), centavos(Number(antes.hoje.total) + 300));
  assert.ok(depois.ultimas.length > 0, "as últimas vendas aparecem para conferência");
});

test("vendedor comum vê só o primeiro nome dos colegas", async () => {
  const p = await painel(tokenMeu);
  const outros = (p.ranking as { nome: string; eu: boolean }[]).filter((r) => !r.eu);
  for (const o of outros) {
    assert.ok(!o.nome.includes(" "), `nome de colega não pode vir inteiro: ${o.nome}`);
  }
  const meu = (p.ranking as { nome: string; eu: boolean }[]).find((r) => r.eu);
  assert.ok(meu, "o vendedor se encontra no ranking");
});

test("vendedor comum não enxerga o número da loja", async () => {
  const p = await painel(tokenMeu);
  assert.equal(p.principal, false);
  assert.equal(p.loja, null, "faturamento da loja é assunto do dono");
});

test("vendedor principal vê a loja e sai do ranking de comissão", async () => {
  await chamar("seller_set_primary", { p_user: usuario, p_flag: true });
  const p = await painel(tokenMeu);

  assert.equal(p.principal, true);
  assert.ok(p.loja, "o principal vê o faturamento da loja");
  assert.ok(Number(p.loja.vendas_mes) >= Number(p.mes.total));

  const nomes = (p.ranking as { nome: string; eu: boolean }[]);
  assert.ok(!nomes.some((r) => r.eu), "o principal não disputa o ranking de comissão");
});

test("apuração de comissão ignora o vendedor principal", async () => {
  const hoje = new Date();
  const periodo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  await apagar("commission_entries", `user_id=eq.${usuario}&status=eq.accrued&period=eq.${periodo}`);
  await chamar("commission_accrue", { p_period: periodo });

  const minhas = await buscar<{ id: string }>(
    `commission_entries?user_id=eq.${usuario}&period=eq.${periodo}&status=eq.accrued&select=id`);
  assert.equal(minhas.length, 0, "dono não comissiona a si mesmo");
});

test("trocar o link derruba o anterior", async () => {
  const r = await chamar("seller_link_rotate", { p_user: usuario });
  assert.equal(r.erro, undefined);
  const novo = r.dados.token as string;
  assert.notEqual(novo, tokenMeu);

  const antigo = await painel(tokenMeu);
  assert.equal(antigo.erro, "link inválido", "quem ficou com o link velho perde o acesso");

  const atual = await painel(novo);
  assert.equal(atual.erro, undefined);
  tokenMeu = novo;
});
