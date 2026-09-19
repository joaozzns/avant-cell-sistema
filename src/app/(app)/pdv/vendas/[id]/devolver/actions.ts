"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export type ItemDevolucao = { saleItemId: string; qty: number; destination: string };

export async function devolverVenda(input: {
  saleId: string;
  reason: string;
  refundKind: string;
  notes: string;
  items: ItemDevolucao[];
}): Promise<{ error?: string; total?: number; credito?: boolean }> {
  const { supabase, storeId, userId } = await getSessionContext();

  if (!input.items.length) return { error: "Selecione ao menos um item para devolver." };

  /* devolução em dinheiro sai do caixa aberto por quem está operando */
  let caixa: string | null = null;
  if (input.refundKind === "cash") {
    const { data } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("store_id", storeId)
      .eq("opened_by", userId)
      .eq("status", "open")
      .maybeSingle();
    if (!data) return { error: "Abra o seu caixa para devolver em dinheiro." };
    caixa = data.id;
  }

  const { data, error } = await supabase.rpc("return_sale", {
    p: {
      sale_id: input.saleId,
      reason: input.reason,
      refund_kind: input.refundKind,
      notes: input.notes,
      cash_session_id: caixa,
      items: input.items.map((i) => ({
        sale_item_id: i.saleItemId,
        qty: i.qty,
        destination: i.destination,
      })),
    },
  });
  if (error) return { error: error.message };

  revalidatePath(`/pdv/vendas/${input.saleId}`);
  revalidatePath("/pdv/vendas");
  revalidatePath("/estoque");
  const r = data as { total: number; credit_id: string | null };
  return { total: Number(r.total), credito: !!r.credit_id };
}
