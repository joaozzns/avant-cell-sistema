"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export async function buscarModelos(termo: string) {
  const { supabase } = await getSessionContext();
  const t = termo.trim();
  if (t.length < 2) return [];
  const { data } = await supabase
    .from("products")
    .select("id, name, sale_price, brands(name)")
    .eq("serialized", true)
    .eq("active", true)
    .ilike("name", `%${t}%`)
    .limit(8);
  return (data ?? []).map((p) => ({
    id: p.id,
    nome: p.name,
    marca: (p.brands as { name?: string } | null)?.name ?? null,
    preco: Number(p.sale_price ?? 0),
  }));
}

export async function buscarClientes(termo: string) {
  const { supabase } = await getSessionContext();
  const t = termo.trim();
  if (t.length < 2) return [];
  const { data } = await supabase
    .from("customers")
    .select("id, name, cpf_cnpj")
    .eq("active", true)
    .or(`name.ilike.%${t}%,cpf_cnpj.ilike.%${t}%`)
    .limit(6);
  return data ?? [];
}

export type EntradaUsado = {
  produtoId: string;
  marca: string;
  modelo: string;
  imei: string;
  cor: string;
  capacidade: string;
  condicao: string;
  checklist: Record<string, boolean>;
  acessorios: string[];
  vendedorNome: string;
  vendedorCpf: string;
  vendedorRg: string;
  docFoto: string;
  fotos: string[];
  clienteId: string | null;
  valorPago: number;
  precoSugerido: number | null;
  formaPagamento: string;
};

export async function registrarUsado(e: EntradaUsado) {
  const { supabase, storeId, userId } = await getSessionContext();

  let caixa: string | null = null;
  if (e.formaPagamento === "cash") {
    const { data } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("store_id", storeId).eq("opened_by", userId).eq("status", "open")
      .maybeSingle();
    if (!data) return { error: "Abra o seu caixa para pagar em dinheiro." };
    caixa = data.id;
  }

  const { data, error } = await supabase.rpc("register_trade_in", {
    p: {
      store_id: storeId,
      product_id: e.produtoId,
      brand: e.marca,
      model: e.modelo,
      imei: e.imei,
      color: e.cor,
      capacity: e.capacidade,
      condition: e.condicao,
      checklist: e.checklist,
      accessories: e.acessorios,
      device_photos: e.fotos,
      seller_name: e.vendedorNome,
      seller_cpf: e.vendedorCpf,
      seller_rg: e.vendedorRg,
      doc_photo_url: e.docFoto,
      customer_id: e.clienteId,
      paid_amount: e.valorPago,
      suggested_price: e.precoSugerido,
      payment_kind: e.formaPagamento,
      cash_session_id: caixa,
    },
  });
  if (error) return { error: error.message };

  revalidatePath("/estoque/usado");
  revalidatePath("/estoque/aparelhos");
  const r = data as { trade_in_id: string; unit_id: string; credit_id: string | null };
  return { ok: true, unidadeId: r.unit_id, credito: !!r.credit_id };
}
