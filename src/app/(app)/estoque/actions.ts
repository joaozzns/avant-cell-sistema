"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { parseDecimal } from "@/lib/format";

export type ActionState = { error?: string; ok?: boolean };

export async function saveProduct(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, companyId } = await getSessionContext();
  const id = String(formData.get("id") ?? "");

  const payload = {
    company_id: companyId,
    type: String(formData.get("type") ?? "accessory"),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    category_id: String(formData.get("category_id") ?? "") || null,
    brand_id: String(formData.get("brand_id") ?? "") || null,
    internal_code: String(formData.get("internal_code") ?? "").trim() || null,
    ean: String(formData.get("ean") ?? "").trim() || null,
    serialized: formData.get("serialized") === "on",
    track_stock: formData.get("type") !== "service",
    internal_use_only: formData.get("internal_use_only") === "on",
    warranty_days: Number(formData.get("warranty_days") ?? 90),
    cost: parseDecimal(formData.get("cost")),
    sale_price: parseDecimal(formData.get("sale_price")),
    min_price: parseDecimal(formData.get("min_price")),
    active: formData.get("active") !== "off",
  };

  if (!payload.name) return { error: "Informe o nome do produto." };
  if (payload.sale_price < payload.cost && payload.sale_price > 0) {
    if (formData.get("confirm_below_cost") !== "on") {
      return { error: "Preço de venda abaixo do custo. Marque a confirmação para salvar assim mesmo." };
    }
  }

  if (id) {
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("products").insert(payload);
    if (error) {
      return {
        error: error.code === "23505"
          ? "Já existe um produto com esse código interno."
          : error.message,
      };
    }
  }
  revalidatePath("/estoque");
  redirect("/estoque");
}

export async function toggleProductActive(id: string, active: boolean) {
  const { supabase } = await getSessionContext();
  // Produto nunca é excluído, apenas inativado
  await supabase.from("products").update({ active }).eq("id", id);
  revalidatePath("/estoque");
}

export async function saveCategory(formData: FormData) {
  const { supabase, companyId } = await getSessionContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("categories").insert({ company_id: companyId, name });
  revalidatePath("/estoque/categorias");
}

export async function saveBrand(formData: FormData) {
  const { supabase, companyId } = await getSessionContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("brands").insert({ company_id: companyId, name });
  revalidatePath("/estoque/categorias");
}

export async function stockAdjust(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, storeId } = await getSessionContext();
  const productId = String(formData.get("product_id") ?? "");
  const qty = parseDecimal(formData.get("qty"));
  const direction = String(formData.get("direction") ?? "in");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!productId || qty <= 0) return { error: "Informe produto e quantidade." };
  if (!reason) return { error: "Motivo é obrigatório: nenhuma quantidade muda sem documento de origem." };

  const { error } = await supabase.rpc("stock_adjust", {
    p_store: storeId,
    p_product: productId,
    p_variant: null,
    p_qty: direction === "in" ? qty : -qty,
    p_type: direction === "in" ? "adjustment_in" : "adjustment_out",
    p_reason: reason,
  });
  if (error) return { error: error.message };
  revalidatePath("/estoque");
  return { ok: true };
}

export async function registerUnit(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, companyId, storeId } = await getSessionContext();
  const productId = String(formData.get("product_id") ?? "");
  const imei1 = String(formData.get("imei1") ?? "").trim();

  if (!productId) return { error: "Selecione o produto (modelo do aparelho)." };
  if (!imei1) return { error: "Informe o IMEI." };

  const { data: unit, error } = await supabase
    .from("serialized_units")
    .insert({
      company_id: companyId,
      store_id: storeId,
      product_id: productId,
      imei1,
      imei2: String(formData.get("imei2") ?? "").trim() || null,
      serial_number: String(formData.get("serial_number") ?? "").trim() || null,
      color: String(formData.get("color") ?? "").trim() || null,
      capacity: String(formData.get("capacity") ?? "").trim() || null,
      condition: String(formData.get("condition") ?? "new"),
      cost: parseDecimal(formData.get("cost")),
      sale_price: parseDecimal(formData.get("sale_price")) || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Este IMEI já está cadastrado no sistema." };
    if (error.code === "23514") return { error: "IMEI inválido: o dígito verificador não confere (15 dígitos, padrão Luhn)." };
    return { error: error.message };
  }

  await supabase.from("stock_movements").insert({
    company_id: companyId,
    store_id: storeId,
    product_id: productId,
    unit_id: unit.id,
    type: "purchase_in",
    qty: 1,
    unit_cost: parseDecimal(formData.get("cost")),
  });

  revalidatePath("/estoque/aparelhos");
  return { ok: true };
}
