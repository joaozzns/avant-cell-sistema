"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { parseDecimal } from "@/lib/format";

export type ActionState = { error?: string; ok?: boolean };

// ---------- Busca de produtos para o PDV (nome, código, EAN ou IMEI) ----------
export async function searchProducts(term: string) {
  const { supabase, storeId } = await getSessionContext();
  const t = term.trim();
  if (t.length < 2) return { products: [], units: [] };

  const digits = t.replace(/\D/g, "");

  const [{ data: products }, { data: units }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, type, sale_price, min_price, serialized, internal_code, ean, stock_items(store_id, qty)")
      .eq("active", true)
      .eq("internal_use_only", false)
      .eq("serialized", false)
      .gt("sale_price", 0)
      .or(`name.ilike.%${t}%,internal_code.ilike.%${t}%,ean.ilike.%${t}%`)
      .limit(12),
    digits.length >= 5
      ? supabase
          .from("serialized_units")
          .select("id, imei1, color, capacity, sale_price, product_id, products(name)")
          .eq("store_id", storeId)
          .eq("status", "available")
          .ilike("imei1", `%${digits}%`)
          .limit(6)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    products: (products ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.sale_price),
      minPrice: Number(p.min_price),
      code: p.internal_code ?? p.ean ?? null,
      isService: p.type === "service",
      stock: Number(
        (p.stock_items as { store_id: string; qty: number }[])
          .find((s) => s.store_id === storeId)?.qty ?? 0
      ),
    })),
    units: (units ?? []).map((u) => ({
      unitId: u.id,
      productId: u.product_id,
      name: `${(u.products as { name?: string } | null)?.name} ${[u.color, u.capacity].filter(Boolean).join(" ")}`.trim(),
      imei: u.imei1,
      price: Number(u.sale_price ?? 0),
    })),
  };
}

export async function searchCustomers(term: string) {
  const { supabase } = await getSessionContext();
  const t = term.trim();
  if (t.length < 2) return [];
  const { data } = await supabase
    .from("customers")
    .select("id, name, cpf_cnpj, phone")
    .eq("active", true)
    .or(`name.ilike.%${t}%,cpf_cnpj.ilike.%${t}%,phone.ilike.%${t}%`)
    .limit(8);
  return data ?? [];
}

// ---------- Venda ----------
export type CartItem = {
  productId: string;
  unitId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
};
export type PaymentEntry = {
  kind: string;
  amount: number;
  installments?: number;
  changeGiven?: number;
};

export async function completeSale(input: {
  items: CartItem[];
  payments: PaymentEntry[];
  customerId?: string | null;
  discount: number;
  notes?: string;
}): Promise<{ error?: string; saleId?: string; number?: number }> {
  const { supabase, storeId, userId } = await getSessionContext();

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("store_id", storeId)
    .eq("opened_by", userId)
    .eq("status", "open")
    .maybeSingle();
  if (!session) return { error: "Sem caixa aberto não há venda. Abra o caixa primeiro." };

  const { data, error } = await supabase.rpc("complete_sale", {
    p: {
      store_id: storeId,
      cash_session_id: session.id,
      customer_id: input.customerId ?? null,
      discount: input.discount,
      notes: input.notes ?? null,
      items: input.items.map((i) => ({
        product_id: i.productId,
        unit_id: i.unitId ?? null,
        qty: i.qty,
        unit_price: i.unitPrice,
        discount: i.discount,
      })),
      payments: input.payments.map((p) => ({
        kind: p.kind,
        amount: p.amount,
        installments: p.installments ?? 1,
        change_given: p.changeGiven ?? 0,
      })),
    },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };

  revalidatePath("/pdv");
  revalidatePath("/dashboard");
  const result = data as { sale_id: string; number: number };
  return { saleId: result.sale_id, number: result.number };
}

// ---------- Caixa ----------
export async function openCash(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, companyId, storeId, userId } = await getSessionContext();
  const { error } = await supabase.from("cash_sessions").insert({
    company_id: companyId,
    store_id: storeId,
    opened_by: userId,
    opening_amount: parseDecimal(formData.get("opening_amount")),
  });
  if (error) {
    return {
      error: error.code === "23505"
        ? "Você já tem um caixa aberto nesta loja."
        : error.message,
    };
  }
  revalidatePath("/pdv/caixa");
  revalidatePath("/pdv");
  return { ok: true };
}

export async function closeCash(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const sessionId = String(formData.get("session_id") ?? "");
  const counted = parseDecimal(formData.get("counted_cash"));
  const justification = String(formData.get("justification") ?? "").trim() || null;

  const { error } = await supabase.rpc("cash_close", {
    p_session: sessionId,
    p_counted: { cash: counted },
    p_justification: justification,
  });
  if (error) return { error: error.message };
  revalidatePath("/pdv/caixa");
  revalidatePath("/pdv");
  return { ok: true };
}

export async function cashMove(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, storeId, userId } = await getSessionContext();
  const type = String(formData.get("type") ?? "withdrawal");
  const amount = parseDecimal(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (amount <= 0) return { error: "Informe o valor." };
  if (!reason) return { error: "Motivo é obrigatório." };

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("store_id", storeId)
    .eq("opened_by", userId)
    .eq("status", "open")
    .maybeSingle();
  if (!session) return { error: "Nenhum caixa aberto." };

  const { error } = await supabase.from("cash_movements").insert({
    session_id: session.id,
    store_id: storeId,
    type,
    amount,
    reason,
    user_id: userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/pdv/caixa");
  return { ok: true };
}
