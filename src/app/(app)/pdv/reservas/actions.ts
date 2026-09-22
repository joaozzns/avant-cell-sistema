"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

const CAMINHO = "/pdv/reservas";

export async function buscarClientes(termo: string) {
  const { supabase } = await getSessionContext();
  const t = termo.trim();
  if (t.length < 2) return [];
  const { data } = await supabase
    .from("customers")
    .select("id, name, cpf_cnpj, whatsapp, phone")
    .eq("active", true)
    .or(`name.ilike.%${t}%,cpf_cnpj.ilike.%${t}%`)
    .limit(6);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    nome: c.name as string,
    documento: (c.cpf_cnpj as string | null) ?? null,
    telefone: (c.whatsapp as string | null) ?? (c.phone as string | null) ?? null,
  }));
}

/** Produtos com o saldo livre da loja: é o que decide se a reserva já sai
 *  separada ou vira encomenda.
 *
 *  Modelo com IMEI não tem saldo em stock_items — o estoque dele é a lista de
 *  aparelhos disponíveis, então o saldo é contado de lá. */
export async function buscarProdutos(termo: string) {
  const { supabase, storeId } = await getSessionContext();
  const t = termo.trim();
  if (t.length < 2) return [];
  const { data } = await supabase
    .from("products")
    .select("id, name, sale_price, serialized, stock_items(qty, reserved, store_id)")
    .eq("active", true)
    .ilike("name", `%${t}%`)
    .limit(8);

  const comImei = (data ?? []).filter((p) => p.serialized).map((p) => p.id as string);
  const unidades = new Map<string, number>();
  if (comImei.length) {
    const { data: livres } = await supabase
      .from("serialized_units")
      .select("product_id")
      .in("product_id", comImei)
      .eq("store_id", storeId)
      .eq("status", "available");
    for (const u of livres ?? []) {
      const id = u.product_id as string;
      unidades.set(id, (unidades.get(id) ?? 0) + 1);
    }
  }

  return (data ?? []).map((p) => {
    const linhas = (p.stock_items ?? []) as { qty: number; reserved: number; store_id: string }[];
    const aqui = linhas.filter((s) => s.store_id === storeId);
    return {
      id: p.id as string,
      nome: p.name as string,
      preco: Number(p.sale_price ?? 0),
      comImei: Boolean(p.serialized),
      livre: p.serialized
        ? (unidades.get(p.id as string) ?? 0)
        : aqui.reduce((s, i) => s + Number(i.qty) - Number(i.reserved), 0),
    };
  });
}

/** Aparelhos com IMEI disponíveis deste modelo, para reservar a peça exata. */
export async function unidadesDisponiveis(produtoId: string) {
  const { supabase, storeId } = await getSessionContext();
  const { data } = await supabase
    .from("serialized_units")
    .select("id, imei1, color, capacity, sale_price, condition")
    .eq("product_id", produtoId)
    .eq("store_id", storeId)
    .eq("status", "available")
    .limit(20);
  return (data ?? []).map((u) => ({
    id: u.id as string,
    imei: (u.imei1 as string | null) ?? "",
    cor: (u.color as string | null) ?? "",
    capacidade: (u.capacity as string | null) ?? "",
    preco: Number(u.sale_price ?? 0),
    condicao: u.condition as string,
  }));
}

export async function criarReserva(e: {
  clienteId: string;
  produtoId: string | null;
  unidadeId: string | null;
  descricao: string;
  precoCombinado: number | null;
  sinal: number;
  formaSinal: string;
  politicaSinal: string;
  prazo: string | null;
}): Promise<{ error?: string; ok?: boolean; situacao?: string }> {
  const { supabase, storeId, userId } = await getSessionContext();

  let caixa: string | null = null;
  if (e.sinal > 0 && e.formaSinal === "cash") {
    const { data } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("store_id", storeId).eq("opened_by", userId).eq("status", "open")
      .maybeSingle();
    if (!data) return { error: "Abra o seu caixa para receber o sinal em dinheiro." };
    caixa = data.id;
  }

  const { data, error } = await supabase.rpc("reservation_create", {
    p: {
      store_id: storeId,
      customer_id: e.clienteId,
      product_id: e.produtoId,
      unit_id: e.unidadeId,
      description: e.descricao,
      agreed_price: e.precoCombinado,
      deposit_amount: e.sinal,
      deposit_kind: e.formaSinal,
      deposit_policy: e.politicaSinal,
      pickup_deadline: e.prazo,
      session_id: caixa,
    },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };

  revalidatePath(CAMINHO);
  revalidatePath("/estoque/aparelhos");
  return { ok: true, situacao: (data as { status?: string })?.status };
}

export async function atualizarReserva(e: {
  id: string;
  situacao: string;
  unidadeId?: string | null;
  prazo?: string | null;
  reterSinal?: boolean;
  motivo?: string;
}): Promise<{ error?: string; ok?: boolean; retido?: number }> {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("reservation_update", {
    p: {
      id: e.id,
      status: e.situacao,
      unit_id: e.unidadeId ?? null,
      pickup_deadline: e.prazo ?? null,
      forfeit_deposit: e.reterSinal ?? false,
      reason: e.motivo ?? null,
    },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };

  revalidatePath(CAMINHO);
  revalidatePath("/estoque/aparelhos");
  return { ok: true, retido: Number((data as { sinal_retido?: number })?.sinal_retido ?? 0) };
}

/** Passou do prazo e ninguém veio buscar: o produto volta para a venda.
 *  O sinal continua sendo do cliente — reter é decisão à parte. */
export async function expirarVencidas() {
  const { supabase, storeId } = await getSessionContext();
  const { data, error } = await supabase.rpc("reservation_expire_due", {
    p: { store_id: storeId },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath(CAMINHO);
  return { vencidas: Number((data as { vencidas?: number })?.vencidas ?? 0) };
}
