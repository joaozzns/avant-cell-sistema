"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export async function abrirInventario(categoriaId: string | null, cego: boolean) {
  const { supabase, storeId } = await getSessionContext();
  const { data, error } = await supabase.rpc("inventory_open", {
    p: { store_id: storeId, category_id: categoriaId, blind: cego },
  });
  if (error) return { error: error.message };
  revalidatePath("/estoque/inventario");
  const r = data as { inventory_id: string; itens: number };
  return { id: r.inventory_id, itens: r.itens };
}

export async function salvarContagem(id: string, itens: { item_id: string; qty: number }[]) {
  const { supabase } = await getSessionContext();
  if (!itens.length) return { error: "Nada para salvar." };
  const { data, error } = await supabase.rpc("inventory_count", { p: { inventory_id: id, items: itens } });
  if (error) return { error: error.message };
  revalidatePath(`/estoque/inventario/${id}`);
  return { contados: (data as { contados: number }).contados };
}

export async function fecharInventario(id: string) {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("inventory_close", { p: { inventory_id: id } });
  if (error) return { error: error.message };
  revalidatePath(`/estoque/inventario/${id}`);
  revalidatePath("/estoque");
  const r = data as { ajustes: number; impacto: number };
  return { ajustes: r.ajustes, impacto: Number(r.impacto) };
}
