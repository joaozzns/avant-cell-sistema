"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { CAMPOS, normalizar, validarLinha, type Tipo } from "@/lib/importacao";

export type ResultadoLinha = {
  linha: number;
  status: "criado" | "atualizado" | "ignorado" | "erro";
  mensagem?: string;
};
export type RespostaLote = { resultados: ResultadoLinha[]; erroGeral?: string };
export type LinhaEnviada = { linha: number; bruto: Record<string, string | number | null> };

/* Lote pequeno: cada linha faz algumas idas ao banco, e a tela mostra progresso
   entre um lote e outro. */
const MAX_LINHAS = 50;
const CONCORRENCIA = 6;

/* Quem pode importar o quê. Owner e admin podem tudo. */
const PAPEIS: Record<Tipo, string[]> = {
  produtos: ["owner", "admin", "manager", "stock"],
  aparelhos: ["owner", "admin", "manager", "stock"],
  clientes: ["owner", "admin", "manager", "seller"],
  fornecedores: ["owner", "admin", "manager", "stock", "finance"],
};

const MOTIVO = "Importação de dados";

/* executa com concorrência limitada, preservando a ordem dos resultados */
async function emParalelo<T, R>(itens: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        saida[i] = await fn(itens[i]);
      }
    })
  );
  return saida;
}

/* numa atualizacao so entram os campos que a planilha trouxe: coluna vazia
   nao apaga o que ja estava cadastrado */
function semVazios<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

function mensagemDoBanco(e: { code?: string; message: string }) {
  if (e.code === "23505") return "Já existe um registro com esse identificador.";
  if (e.code === "23514") return "O banco recusou um valor inválido (ex.: IMEI com dígito verificador errado).";
  if (e.code === "42501") return "Sem permissão para gravar este registro.";
  return e.message;
}

export async function importarLote(
  tipo: Tipo,
  linhas: LinhaEnviada[],
  atualizarExistentes: boolean
): Promise<RespostaLote> {
  if (!(tipo in CAMPOS)) return { resultados: [], erroGeral: "Tipo de importação desconhecido." };
  if (!Array.isArray(linhas) || linhas.length === 0) return { resultados: [] };
  if (linhas.length > MAX_LINHAS) return { resultados: [], erroGeral: `Envie no máximo ${MAX_LINHAS} linhas por lote.` };

  const { supabase, userId, companyId, storeId } = await getSessionContext();

  const { data: vinculo } = await supabase
    .from("user_stores")
    .select("roles(key)")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .maybeSingle();
  const papel = (vinculo?.roles as unknown as { key?: string } | null)?.key;
  if (!papel || !PAPEIS[tipo].includes(papel)) {
    return { resultados: [], erroGeral: "Seu perfil de acesso não permite importar este tipo de dado." };
  }

  /* validacao do servidor e a que vale */
  const validadas = linhas.map((l) => ({ linha: l.linha, ...validarLinha(tipo, l.bruto ?? {}) }));

  let resultados: ResultadoLinha[];
  switch (tipo) {
    case "produtos":
      resultados = await importarProdutos();
      revalidatePath("/estoque");
      break;
    case "clientes":
      resultados = await importarClientes();
      revalidatePath("/clientes");
      break;
    case "fornecedores":
      resultados = await importarFornecedores();
      revalidatePath("/compras/fornecedores");
      break;
    case "aparelhos":
      resultados = await importarAparelhos();
      revalidatePath("/estoque/aparelhos");
      revalidatePath("/estoque");
      break;
  }
  revalidatePath("/dashboard");
  return { resultados };

  /* ------------------------------------------------------------ categorias e marcas */
  async function resolverNomes(tabela: "categories" | "brands", nomes: (string | null)[]) {
    const mapa = new Map<string, string>();
    const pedidos = [...new Set(nomes.filter((n): n is string => Boolean(n)))];
    if (pedidos.length === 0) return mapa;
    const { data } = await supabase.from(tabela).select("id, name").eq("company_id", companyId);
    for (const r of data ?? []) mapa.set(normalizar(r.name), r.id);
    /* cria antes de processar as linhas, para linhas em paralelo nao duplicarem */
    for (const nome of pedidos) {
      const k = normalizar(nome);
      if (mapa.has(k)) continue;
      const { data: novo } = await supabase
        .from(tabela)
        .insert({ company_id: companyId, name: nome })
        .select("id")
        .single();
      if (novo) mapa.set(k, novo.id);
    }
    return mapa;
  }

  /* ------------------------------------------------------------ produtos */
  async function importarProdutos(): Promise<ResultadoLinha[]> {
    const ok = validadas.filter((v) => v.erros.length === 0);
    const [categorias, marcas] = await Promise.all([
      resolverNomes("categories", ok.map((v) => v.dados.categoria as string | null)),
      resolverNomes("brands", ok.map((v) => v.dados.marca as string | null)),
    ]);

    const codigos = ok.map((v) => v.dados.codigo).filter(Boolean) as string[];
    const eans = ok.map((v) => v.dados.ean).filter(Boolean) as string[];
    const nomes = ok.map((v) => v.dados.nome).filter(Boolean) as string[];
    const cols = "id, name, internal_code, ean, type, serialized";
    const [porCodigo, porEan, porNome] = await Promise.all([
      codigos.length ? supabase.from("products").select(cols).eq("company_id", companyId).in("internal_code", codigos) : { data: [] },
      eans.length ? supabase.from("products").select(cols).eq("company_id", companyId).in("ean", eans) : { data: [] },
      nomes.length ? supabase.from("products").select(cols).eq("company_id", companyId).in("name", nomes) : { data: [] },
    ]);
    const idxCodigo = new Map((porCodigo.data ?? []).map((p) => [p.internal_code as string, p]));
    const idxEan = new Map((porEan.data ?? []).map((p) => [p.ean as string, p]));
    const idxNome = new Map((porNome.data ?? []).map((p) => [normalizar(p.name), p]));

    return emParalelo(validadas, async (v): Promise<ResultadoLinha> => {
      if (v.erros.length) return { linha: v.linha, status: "erro", mensagem: v.erros.join(" ") };
      const d = v.dados;
      const existente =
        (d.codigo && idxCodigo.get(d.codigo as string)) ||
        (d.ean && idxEan.get(d.ean as string)) ||
        idxNome.get(normalizar(d.nome));

      if (existente && !atualizarExistentes) {
        return { linha: v.linha, status: "ignorado", mensagem: `Já cadastrado como "${existente.name}".` };
      }

      const tipoProd = d.tipo as string;
      const payload = {
        company_id: companyId,
        type: tipoProd,
        name: d.nome as string,
        description: d.descricao,
        category_id: d.categoria ? categorias.get(normalizar(d.categoria)) ?? null : null,
        brand_id: d.marca ? marcas.get(normalizar(d.marca)) ?? null : null,
        internal_code: d.codigo,
        ean: d.ean,
        serialized: d.controla_imei as boolean,
        track_stock: tipoProd !== "service",
        warranty_days: d.garantia_dias,
        cost: d.custo,
        sale_price: d.preco,
        min_price: d.preco_minimo,
      };

      let produtoId: string;
      let status: ResultadoLinha["status"];
      if (existente) {
        const { error } = await supabase.from("products").update(semVazios(payload)).eq("id", existente.id);
        if (error) return { linha: v.linha, status: "erro", mensagem: mensagemDoBanco(error) };
        produtoId = existente.id;
        status = "atualizado";
      } else {
        const { data, error } = await supabase.from("products").insert(semVazios(payload)).select("id").single();
        if (error || !data) return { linha: v.linha, status: "erro", mensagem: error ? mensagemDoBanco(error) : "Falha ao gravar." };
        produtoId = data.id;
        status = "criado";
      }

      /* saldo: a planilha traz o saldo desejado; lancamos so a diferenca, com motivo */
      const avisos = [...v.avisos];
      if (d.estoque !== null && tipoProd !== "service" && !d.controla_imei) {
        const { data: item } = await supabase
          .from("stock_items")
          .select("qty")
          .eq("store_id", storeId)
          .eq("product_id", produtoId)
          .is("variant_id", null)
          .maybeSingle();
        const delta = (d.estoque as number) - Number(item?.qty ?? 0);
        if (delta !== 0) {
          const { error } = await supabase.rpc("stock_adjust", {
            p_store: storeId,
            p_product: produtoId,
            p_variant: null,
            p_qty: delta,
            p_type: delta > 0 ? "adjustment_in" : "adjustment_out",
            p_reason: `${MOTIVO}: saldo inicial`,
          });
          if (error) avisos.push(`Produto gravado, mas o saldo não: ${mensagemDoBanco(error)}`);
        }
      }
      if (d.estoque_minimo !== null && tipoProd !== "service") {
        const { error } = await supabase
          .from("stock_items")
          .upsert(
            { store_id: storeId, product_id: produtoId, variant_id: null, min_qty: d.estoque_minimo },
            { onConflict: "store_id,product_id,variant_id" }
          );
        if (error) avisos.push(`Estoque mínimo não gravado: ${mensagemDoBanco(error)}`);
      }
      return { linha: v.linha, status, mensagem: avisos.join(" ") || undefined };
    });
  }

  /* ------------------------------------------------------------ clientes */
  async function importarClientes(): Promise<ResultadoLinha[]> {
    const ok = validadas.filter((v) => v.erros.length === 0);
    const docs = ok.map((v) => v.dados.cpf_cnpj).filter(Boolean) as string[];
    const emails = ok.map((v) => v.dados.email).filter(Boolean) as string[];
    const [porDoc, porEmail] = await Promise.all([
      docs.length ? supabase.from("customers").select("id, name, cpf_cnpj").eq("company_id", companyId).in("cpf_cnpj", docs) : { data: [] },
      emails.length ? supabase.from("customers").select("id, name, email").eq("company_id", companyId).in("email", emails) : { data: [] },
    ]);
    const idxDoc = new Map((porDoc.data ?? []).map((c) => [c.cpf_cnpj as string, c]));
    const idxEmail = new Map((porEmail.data ?? []).map((c) => [String(c.email).toLowerCase(), c]));

    return emParalelo(validadas, async (v): Promise<ResultadoLinha> => {
      if (v.erros.length) return { linha: v.linha, status: "erro", mensagem: v.erros.join(" ") };
      const d = v.dados;
      const existente = (d.cpf_cnpj && idxDoc.get(d.cpf_cnpj as string)) || (d.email && idxEmail.get(d.email as string));
      if (existente && !atualizarExistentes) {
        return { linha: v.linha, status: "ignorado", mensagem: `Já cadastrado como "${existente.name}".` };
      }

      const endereco = semVazios({
        cep: d.cep, street: d.rua, number: d.numero, district: d.bairro, city: d.cidade, state: d.uf,
      });
      const payload = {
        company_id: companyId,
        kind: d.tipo_pessoa as string,
        name: d.nome as string,
        cpf_cnpj: d.cpf_cnpj,
        phone: d.telefone,
        whatsapp: d.whatsapp,
        email: d.email,
        birthdate: d.nascimento,
        notes: d.observacoes,
        address: Object.keys(endereco).length ? endereco : null,
        origin: existente ? null : "importação",
      };

      const aviso = v.avisos.join(" ") || undefined;
      if (existente) {
        const { error } = await supabase.from("customers").update(semVazios(payload)).eq("id", existente.id);
        return error
          ? { linha: v.linha, status: "erro", mensagem: mensagemDoBanco(error) }
          : { linha: v.linha, status: "atualizado", mensagem: aviso };
      }
      const { error } = await supabase.from("customers").insert(semVazios(payload));
      return error
        ? { linha: v.linha, status: "erro", mensagem: mensagemDoBanco(error) }
        : { linha: v.linha, status: "criado", mensagem: aviso };
    });
  }

  /* ------------------------------------------------------------ fornecedores */
  async function importarFornecedores(): Promise<ResultadoLinha[]> {
    const ok = validadas.filter((v) => v.erros.length === 0);
    const docs = ok.map((v) => v.dados.cnpj).filter(Boolean) as string[];
    const nomes = ok.map((v) => v.dados.nome).filter(Boolean) as string[];
    const [porDoc, porNome] = await Promise.all([
      docs.length ? supabase.from("suppliers").select("id, name, cnpj").eq("company_id", companyId).in("cnpj", docs) : { data: [] },
      nomes.length ? supabase.from("suppliers").select("id, name, cnpj").eq("company_id", companyId).in("name", nomes) : { data: [] },
    ]);
    const idxDoc = new Map((porDoc.data ?? []).map((s) => [s.cnpj as string, s]));
    const idxNome = new Map((porNome.data ?? []).map((s) => [normalizar(s.name), s]));

    return emParalelo(validadas, async (v): Promise<ResultadoLinha> => {
      if (v.erros.length) return { linha: v.linha, status: "erro", mensagem: v.erros.join(" ") };
      const d = v.dados;
      const existente = (d.cnpj && idxDoc.get(d.cnpj as string)) || idxNome.get(normalizar(d.nome));
      if (existente && !atualizarExistentes) {
        return { linha: v.linha, status: "ignorado", mensagem: `Já cadastrado como "${existente.name}".` };
      }
      const contato = semVazios({ vendedor: d.vendedor, telefone: d.telefone, email: d.email });
      const payload = {
        company_id: companyId,
        name: d.nome as string,
        cnpj: d.cnpj,
        contact: Object.keys(contato).length ? contato : null,
        payment_terms: d.prazo_pagamento,
        lead_time_days: d.prazo_entrega,
        notes: d.observacoes,
      };
      const aviso = v.avisos.join(" ") || undefined;
      if (existente) {
        const { error } = await supabase.from("suppliers").update(semVazios(payload)).eq("id", existente.id);
        return error
          ? { linha: v.linha, status: "erro", mensagem: mensagemDoBanco(error) }
          : { linha: v.linha, status: "atualizado", mensagem: aviso };
      }
      const { error } = await supabase.from("suppliers").insert(semVazios(payload));
      return error
        ? { linha: v.linha, status: "erro", mensagem: mensagemDoBanco(error) }
        : { linha: v.linha, status: "criado", mensagem: aviso };
    });
  }

  /* ------------------------------------------------------------ aparelhos com IMEI */
  async function importarAparelhos(): Promise<ResultadoLinha[]> {
    const ok = validadas.filter((v) => v.erros.length === 0);
    const imeis = ok.map((v) => v.dados.imei1).filter(Boolean) as string[];
    const { data: jaTem } = imeis.length
      ? await supabase.from("serialized_units").select("imei1").eq("company_id", companyId).in("imei1", imeis)
      : { data: [] };
    const imeisExistentes = new Set((jaTem ?? []).map((u) => u.imei1 as string));

    /* um produto "modelo" por nome; criado uma vez so, antes das linhas */
    const marcas = await resolverNomes("brands", ok.map((v) => v.dados.marca as string | null));
    const nomes = [...new Set(ok.map((v) => v.dados.modelo as string))];
    const { data: prods } = nomes.length
      ? await supabase.from("products").select("id, name").eq("company_id", companyId).eq("type", "device").in("name", nomes)
      : { data: [] };
    const modelos = new Map((prods ?? []).map((p) => [normalizar(p.name), p.id as string]));
    for (const v of ok) {
      const k = normalizar(v.dados.modelo);
      if (modelos.has(k) || imeisExistentes.has(v.dados.imei1 as string)) continue;
      const { data: novo } = await supabase
        .from("products")
        .insert(semVazios({
          company_id: companyId,
          type: "device",
          name: v.dados.modelo as string,
          brand_id: v.dados.marca ? marcas.get(normalizar(v.dados.marca)) ?? null : null,
          serialized: true,
          track_stock: true,
          cost: v.dados.custo,
          sale_price: v.dados.preco,
        }))
        .select("id")
        .single();
      if (novo) modelos.set(k, novo.id);
    }

    return emParalelo(validadas, async (v): Promise<ResultadoLinha> => {
      if (v.erros.length) return { linha: v.linha, status: "erro", mensagem: v.erros.join(" ") };
      const d = v.dados;
      if (imeisExistentes.has(d.imei1 as string)) {
        return { linha: v.linha, status: "ignorado", mensagem: "IMEI já cadastrado. Aparelhos existentes não são alterados pela importação." };
      }
      const produtoId = modelos.get(normalizar(d.modelo));
      if (!produtoId) return { linha: v.linha, status: "erro", mensagem: "Não foi possível criar o modelo do aparelho." };

      const { data: unidade, error } = await supabase
        .from("serialized_units")
        .insert(semVazios({
          company_id: companyId,
          store_id: storeId,
          product_id: produtoId,
          imei1: d.imei1,
          imei2: d.imei2,
          serial_number: d.serie,
          color: d.cor,
          capacity: d.capacidade,
          condition: d.condicao,
          origin: "import",
          cost: d.custo ?? 0,
          sale_price: d.preco,
        }))
        .select("id")
        .single();
      if (error || !unidade) {
        return { linha: v.linha, status: "erro", mensagem: error ? mensagemDoBanco(error) : "Falha ao gravar." };
      }

      /* mesmo registro que a entrada manual de aparelho grava */
      await supabase.from("stock_movements").insert({
        company_id: companyId,
        store_id: storeId,
        product_id: produtoId,
        unit_id: unidade.id,
        type: "adjustment_in",
        qty: 1,
        unit_cost: d.custo ?? 0,
        reason: MOTIVO,
      });
      return { linha: v.linha, status: "criado", mensagem: v.avisos.join(" ") || undefined };
    });
  }
}
