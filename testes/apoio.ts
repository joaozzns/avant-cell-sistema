/**
 * Apoio dos testes das regras de dinheiro.
 *
 * Os testes falam com o Supabase pelo PostgREST, com o token de um usuário de
 * verdade — é assim que o app fala, então é assim que o teste tem que falar.
 * Testar a função direto no banco (como superusuário) passaria por cima do RLS
 * e das permissões, que são metade das regras que a gente quer proteger.
 *
 * Cada teste cria o que precisa, com nome começando em ZZTESTE, e apaga no
 * fim. Ainda assim: rode contra um projeto de teste, nunca contra a base de
 * uma loja em operação.
 */

import fs from "node:fs";
import path from "node:path";

function lerEnv(): Record<string, string> {
  const arquivo = path.join(process.cwd(), ".env.local");
  const texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] ??= m[2].trim();
  }
  return env;
}

const env = lerEnv();
export const URL_API = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.AVC_TESTE_EMAIL ?? "teste@avantcell.com.br";
const SENHA = env.AVC_TESTE_SENHA ?? "AvantCell@2026";

let token = "";

export async function entrar() {
  if (token) return token;
  const r = await fetch(`${URL_API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: CHAVE, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  });
  const corpo = await r.json();
  if (!corpo.access_token) throw new Error("Não consegui entrar: " + JSON.stringify(corpo));
  token = corpo.access_token as string;
  return token;
}

async function cabecalhos(extra: Record<string, string> = {}) {
  return { apikey: CHAVE, Authorization: `Bearer ${await entrar()}`, ...extra };
}

export async function buscar<T = Record<string, unknown>>(consulta: string): Promise<T[]> {
  const r = await fetch(`${URL_API}/rest/v1/${consulta}`, { headers: await cabecalhos() });
  const corpo = await r.json();
  if (!Array.isArray(corpo)) throw new Error("Consulta falhou: " + JSON.stringify(corpo));
  return corpo as T[];
}

export async function um<T = Record<string, unknown>>(consulta: string): Promise<T> {
  const linhas = await buscar<T>(consulta);
  if (!linhas.length) throw new Error("Nada encontrado em " + consulta);
  return linhas[0];
}

export async function inserir<T = Record<string, unknown>>(tabela: string, dados: unknown): Promise<T> {
  const r = await fetch(`${URL_API}/rest/v1/${tabela}`, {
    method: "POST",
    headers: await cabecalhos({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(dados),
  });
  const corpo = await r.json();
  if (!Array.isArray(corpo) || !corpo.length) throw new Error(`Insert em ${tabela} falhou: ` + JSON.stringify(corpo));
  return corpo[0] as T;
}

export async function alterar(tabela: string, filtro: string, dados: unknown) {
  const r = await fetch(`${URL_API}/rest/v1/${tabela}?${filtro}`, {
    method: "PATCH",
    headers: await cabecalhos({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(dados),
  });
  return r.json();
}

export async function apagar(tabela: string, filtro: string) {
  await fetch(`${URL_API}/rest/v1/${tabela}?${filtro}`, {
    method: "DELETE",
    headers: await cabecalhos(),
  });
}

/** Chama a função do banco. Devolve { erro } no lugar de estourar, porque
 *  metade dos testes existe justamente para conferir a recusa. */
export async function chamar(nome: string, payload: unknown): Promise<{ dados?: any; erro?: string }> {
  const r = await fetch(`${URL_API}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: await cabecalhos({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return { erro: String(corpo?.message ?? r.status) };
  return { dados: corpo };
}

export async function contexto() {
  const perfil = await um<{ company_id: string; id: string }>("profiles?select=id,company_id&limit=1");
  const loja = await um<{ id: string; name: string }>("stores?select=id,name&order=name&limit=1");
  return { empresa: perfil.company_id, usuario: perfil.id, loja: loja.id };
}

export async function caixaAberto(loja: string) {
  const sessoes = await buscar<{ id: string }>(
    `cash_sessions?select=id&store_id=eq.${loja}&status=eq.open&limit=1`);
  if (sessoes.length) return sessoes[0].id;
  const nova = await inserir<{ id: string }>("cash_sessions", {
    company_id: (await contexto()).empresa, store_id: loja, opened_by: (await contexto()).usuario,
    status: "open", opening_amount: 0,
  });
  return nova.id;
}

export async function dinheiroEsperado(sessao: string): Promise<number> {
  const { dados } = await chamar("cash_expected", { p_session: sessao });
  return Number(dados?.cash ?? 0);
}

/** Lixeira: cada teste registra o que criou e a limpeza roda no fim. */
const lixeira: { tabela: string; filtro: string }[] = [];
export function descartar(tabela: string, filtro: string) {
  lixeira.unshift({ tabela, filtro });
}
export async function limpar() {
  for (const { tabela, filtro } of lixeira) {
    await apagar(tabela, filtro);
  }
  lixeira.length = 0;
}

export const marca = () => `ZZTESTE-${Date.now().toString(36)}`;

/* ---------- fábricas: o mínimo para simular uma venda de verdade ---------- */

export async function criarCliente(nome: string) {
  const { empresa } = await contexto();
  const c = await inserir<{ id: string }>("customers", { company_id: empresa, name: nome });
  descartar("customers", `id=eq.${c.id}`);
  return c.id;
}

export async function criarProduto(nome: string, preco: number, custo = 0) {
  const { empresa } = await contexto();
  const p = await inserir<{ id: string }>("products", {
    company_id: empresa, name: nome, type: "accessory", sale_price: preco,
    cost: custo, avg_cost: custo, track_stock: true, serialized: false, active: true,
  });
  descartar("products", `id=eq.${p.id}`);
  return p.id;
}

export async function porEstoque(loja: string, produto: string, qtd: number) {
  const item = await inserir<{ id: string }>("stock_items", {
    store_id: loja, product_id: produto, qty: qtd, reserved: 0, in_transit: 0,
  });
  descartar("stock_items", `id=eq.${item.id}`);
  return item.id;
}

export async function vender(entrada: {
  loja: string; sessao: string; cliente?: string | null; produto: string;
  qtd: number; preco: number; formas: { kind: string; amount: number }[];
}) {
  const { dados, erro } = await chamar("complete_sale", {
    p: {
      store_id: entrada.loja,
      cash_session_id: entrada.sessao,
      customer_id: entrada.cliente ?? null,
      discount: 0,
      items: [{ product_id: entrada.produto, unit_id: null, qty: entrada.qtd, unit_price: entrada.preco, discount: 0 }],
      payments: entrada.formas.map((f) => ({ ...f, installments: 1, change_given: 0 })),
    },
  });
  if (erro) throw new Error("venda de teste falhou: " + erro);
  const venda = dados as { sale_id: string; number: number; total: number };
  descartar("sales", `id=eq.${venda.sale_id}`);
  return venda;
}

export async function itensDaVenda(vendaId: string) {
  return buscar<{ id: string; qty: number; returned_qty: number | null }>(
    `sale_items?sale_id=eq.${vendaId}&select=id,qty,returned_qty`);
}

/** Compara dinheiro: o banco guarda numeric, o JavaScript soma em binário —
 *  499,70 vira 499,70000000000005 e o teste quebra por nada. */
export function centavos(valor: number) {
  return Math.round(valor * 100) / 100;
}
