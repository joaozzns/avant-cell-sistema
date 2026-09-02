"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { parseDecimal } from "@/lib/format";

export type ActionState = { error?: string; ok?: boolean };

export async function settleReceivable(input: {
  id: string; amount: number; interest?: number; discount?: number; accountId?: string | null;
}): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("settle_receivable", {
    p_id: input.id,
    p_amount: input.amount,
    p_interest: input.interest ?? 0,
    p_discount: input.discount ?? 0,
    p_account: input.accountId ?? null,
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath("/financeiro/receber");
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function settlePayable(input: {
  id: string; amount: number; accountId: string;
}): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  if (!input.accountId) return { error: "Informe a conta de origem do pagamento." };
  const { error } = await supabase.rpc("settle_payable", {
    p_id: input.id, p_amount: input.amount, p_account: input.accountId,
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath("/financeiro/pagar");
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function createPayable(
  _prev: ActionState, formData: FormData
): Promise<ActionState> {
  const { supabase, companyId, storeId, userId } = await getSessionContext();
  const description = String(formData.get("description") ?? "").trim();
  const amount = parseDecimal(formData.get("amount"));
  const dueDate = String(formData.get("due_date") ?? "");

  if (!description) return { error: "Descreva o lançamento." };
  if (amount <= 0) return { error: "Informe o valor." };
  if (!dueDate) return { error: "Informe o vencimento." };

  const { error } = await supabase.from("payables").insert({
    company_id: companyId,
    store_id: storeId,
    description,
    amount,
    due_date: dueDate,
    category_id: String(formData.get("category_id") ?? "") || null,
    cost_center_id: String(formData.get("cost_center_id") ?? "") || null,
    created_by: userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/financeiro/pagar");
  return { ok: true };
}

export async function createAccount(
  _prev: ActionState, formData: FormData
): Promise<ActionState> {
  const { supabase, companyId } = await getSessionContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome da conta." };
  const { error } = await supabase.from("accounts").insert({
    company_id: companyId,
    name,
    type: String(formData.get("type") ?? "bank"),
    initial_balance: parseDecimal(formData.get("initial_balance")),
  });
  if (error) return { error: error.message };
  revalidatePath("/financeiro");
  return { ok: true };
}
