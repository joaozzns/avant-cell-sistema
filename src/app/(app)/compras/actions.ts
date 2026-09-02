"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { parseDecimal } from "@/lib/format";

export type ActionState = { error?: string; ok?: boolean };

export async function saveSupplier(
  _prev: ActionState, formData: FormData
): Promise<ActionState> {
  const { supabase, companyId } = await getSessionContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do fornecedor." };
  const { error } = await supabase.from("suppliers").insert({
    company_id: companyId,
    name,
    cnpj: String(formData.get("cnpj") ?? "").replace(/\D/g, "") || null,
    contact: {
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      seller: String(formData.get("seller") ?? "").trim() || null,
    },
    payment_terms: String(formData.get("payment_terms") ?? "").trim() || null,
    lead_time_days: Number(formData.get("lead_time_days")) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/compras/fornecedores");
  return { ok: true };
}

export async function searchPoProducts(term: string) {
  const { supabase, storeId } = await getSessionContext();
  if (term.trim().length < 2) return [];
  const { data } = await supabase
    .from("products")
    .select("id, name, cost, stock_items(store_id, qty, min_qty)")
    .eq("active", true)
    .neq("type", "service")
    .ilike("name", `%${term.trim()}%`)
    .limit(8);
  return (data ?? []).map((p) => {
    const s = (p.stock_items as { store_id: string; qty: number; min_qty: number }[])
      .find((x) => x.store_id === storeId);
    return { id: p.id, name: p.name, cost: Number(p.cost),
             stock: Number(s?.qty ?? 0), min: Number(s?.min_qty ?? 0) };
  });
}

export async function createPurchaseOrder(input: {
  supplierId: string;
  expectedAt?: string | null;
  notes?: string;
  items: { productId: string; qty: number; unitCost: number }[];
}): Promise<{ error?: string; poId?: string }> {
  const { supabase, companyId, storeId, userId } = await getSessionContext();
  if (!input.supplierId) return { error: "Selecione o fornecedor." };
  if (input.items.length === 0) return { error: "Adicione itens ao pedido." };

  const { data: number } = await supabase.rpc("next_store_number", {
    p_store: storeId, p_kind: "purchase_order",
  });

  const total = input.items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: companyId, store_id: storeId, supplier_id: input.supplierId,
      number, status: "sent", expected_at: input.expectedAt || null,
      notes: input.notes || null, total, created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: itemsErr } = await supabase.from("purchase_order_items").insert(
    input.items.map((i) => ({
      po_id: po.id, product_id: i.productId, qty: i.qty, unit_cost: i.unitCost,
    }))
  );
  if (itemsErr) return { error: itemsErr.message };

  revalidatePath("/compras");
  return { poId: po.id };
}

export async function receivePo(input: {
  poId: string;
  invoiceNumber?: string;
  freight?: number;
  dueDate?: string;
  items: { itemId: string; qtyReceived: number; unitCost?: number }[];
}): Promise<{ error?: string; total?: number }> {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("po_receive", {
    p: {
      po_id: input.poId,
      invoice_number: input.invoiceNumber ?? null,
      freight: input.freight ?? 0,
      due_date: input.dueDate ?? null,
      items: input.items.map((i) => ({
        item_id: i.itemId, qty_received: i.qtyReceived, unit_cost: i.unitCost ?? null,
      })),
    },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath(`/compras/${input.poId}`);
  revalidatePath("/compras");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/pagar");
  const r = data as { total: number };
  return { total: r.total };
}

export async function cancelPo(poId: string): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "canceled" })
    .eq("id", poId)
    .in("status", ["draft", "sent", "confirmed"]);
  if (error) return { error: error.message };
  revalidatePath("/compras");
  redirect("/compras");
}
