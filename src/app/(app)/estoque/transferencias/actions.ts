"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export type ItemTransferencia = {
  productId: string;
  variantId?: string | null;
  unitId?: string | null;
  qty: number;
};

/** Itens que a loja pode mandar: aparelhos com IMEI disponíveis e produtos com saldo. */
export async function buscarParaTransferir(termo: string) {
  const { supabase, storeId } = await getSessionContext();
  const t = termo.trim();
  if (t.length < 2) return { unidades: [], produtos: [] };

  const [{ data: unidades }, { data: produtos }] = await Promise.all([
    supabase.from("serialized_units")
      .select("id, imei1, color, capacity, products(id, name)")
      .eq("store_id", storeId).eq("status", "available")
      .or(`imei1.ilike.%${t}%,serial_number.ilike.%${t}%`)
      .limit(6),
    supabase.from("stock_items")
      .select("qty, product_id, variant_id, products(id, name, serialized)")
      .eq("store_id", storeId).gt("qty", 0)
      .limit(20),
  ]);

  const lista = (produtos ?? [])
    .map((s) => ({
      productId: s.product_id,
      variantId: s.variant_id,
      nome: (s.products as { name?: string } | null)?.name ?? "",
      serial: (s.products as { serialized?: boolean } | null)?.serialized ?? false,
      saldo: Number(s.qty),
    }))
    .filter((p) => !p.serial && p.nome.toLowerCase().includes(t.toLowerCase()))
    .slice(0, 6);

  return {
    unidades: (unidades ?? []).map((u) => ({
      id: u.id,
      imei: u.imei1,
      nome: (u.products as { name?: string } | null)?.name ?? "Aparelho",
      detalhe: [u.color, u.capacity].filter(Boolean).join(" · "),
      productId: (u.products as { id?: string } | null)?.id ?? "",
    })),
    produtos: lista,
  };
}

export async function lojasDestino() {
  const { supabase, companyId, storeId } = await getSessionContext();
  const { data } = await supabase
    .from("stores").select("id, name").eq("company_id", companyId).eq("active", true).neq("id", storeId);
  return data ?? [];
}

export async function criarTransferencia(destino: string, itens: ItemTransferencia[], obs: string) {
  const { supabase, companyId, storeId, userId } = await getSessionContext();
  if (!destino) return { error: "Escolha a loja de destino." };
  if (!itens.length) return { error: "Adicione ao menos um item." };

  const { data: t, error } = await supabase
    .from("transfers")
    .insert({
      company_id: companyId, from_store: storeId, to_store: destino,
      notes: obs || null, created_by: userId,
    })
    .select("id").single();
  if (error) return { error: error.message };

  const { error: e2 } = await supabase.from("transfer_items").insert(
    itens.map((i) => ({
      transfer_id: t.id, product_id: i.productId,
      variant_id: i.variantId ?? null, unit_id: i.unitId ?? null, qty: i.qty,
    })),
  );
  if (e2) {
    await supabase.from("transfers").delete().eq("id", t.id);
    return { error: e2.message };
  }

  revalidatePath("/estoque/transferencias");
  return { id: t.id as string };
}

export async function enviarTransferencia(id: string) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("transfer_send", { p: { transfer_id: id } });
  if (error) return { error: error.message };
  revalidatePath(`/estoque/transferencias/${id}`);
  revalidatePath("/estoque");
  return {};
}

export async function receberTransferencia(
  id: string,
  itens: { item_id: string; qty_received: number; divergence?: string }[],
) {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("transfer_receive", { p: { transfer_id: id, items: itens } });
  if (error) return { error: error.message };
  revalidatePath(`/estoque/transferencias/${id}`);
  revalidatePath("/estoque");
  return { divergencia: (data as { divergencia: boolean }).divergencia };
}

export async function cancelarTransferencia(id: string) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("transfer_cancel", { p: { transfer_id: id } });
  if (error) return { error: error.message };
  revalidatePath(`/estoque/transferencias/${id}`);
  return {};
}
