"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { parseDecimal } from "@/lib/format";

export type ActionState = { error?: string; ok?: boolean };

// ---------- Abertura de OS (check-in) ----------
export async function createOs(input: {
  customerId?: string | null;
  newCustomer?: { name: string; phone: string } | null;
  device: {
    brand: string; model: string; imei?: string;
    color?: string; capacity?: string;
  };
  reportedIssue: string;
  symptomTags: string[];
  checklist: Record<string, boolean>;
  accessories: string[];
  devicePassword?: string;
  passwordNotGiven: boolean;
  priority: "normal" | "urgent";
  deadline?: string | null;
  estimatedPrice?: number | null;
  diagnosisFee?: number | null;
}): Promise<{ error?: string; osId?: string; number?: number }> {
  const { supabase, companyId, storeId, userId } = await getSessionContext();

  let customerId = input.customerId ?? null;
  if (!customerId && input.newCustomer?.name) {
    const { data: c, error } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
        name: input.newCustomer.name,
        phone: input.newCustomer.phone || null,
        whatsapp: input.newCustomer.phone || null,
      })
      .select("id")
      .single();
    if (error) return { error: "Erro ao cadastrar cliente: " + error.message };
    customerId = c.id;
  }
  if (!customerId) return { error: "Vincule ou cadastre o cliente." };

  // Aparelho do cliente: reaproveita pelo IMEI ou cria
  let deviceId: string | null = null;
  const imei = input.device.imei?.replace(/\D/g, "") || null;
  if (imei) {
    const { data: existing } = await supabase
      .from("customer_devices")
      .select("id, customer_id")
      .eq("imei", imei)
      .eq("status", "active")
      .maybeSingle();
    if (existing) deviceId = existing.id;
  }
  if (!deviceId) {
    const { data: dev, error } = await supabase
      .from("customer_devices")
      .insert({
        company_id: companyId,
        customer_id: customerId,
        model_text: `${input.device.brand} ${input.device.model}`.trim(),
        imei,
        color: input.device.color || null,
        capacity: input.device.capacity || null,
      })
      .select("id")
      .single();
    if (error) return { error: "Erro ao registrar aparelho: " + error.message };
    deviceId = dev.id;
  }

  const { data: numberData, error: numErr } = await supabase.rpc("next_store_number", {
    p_store: storeId,
    p_kind: "service_order",
  });
  if (numErr) return { error: numErr.message };

  const notLighting = input.checklist["liga"] === false;

  const { data: os, error } = await supabase
    .from("service_orders")
    .insert({
      company_id: companyId,
      store_id: storeId,
      number: numberData,
      customer_id: customerId,
      customer_device_id: deviceId,
      reported_issue: input.reportedIssue,
      symptom_tags: input.symptomTags,
      entry_checklist: input.checklist,
      accessories: input.accessories,
      device_password: input.devicePassword || null,
      password_not_given: input.passwordNotGiven,
      internal_state_unknown: notLighting,
      priority: input.priority,
      deadline: input.deadline || null,
      estimated_price: input.estimatedPrice ?? null,
      diagnosis_fee: input.diagnosisFee ?? 0,
      created_by: userId,
    })
    .select("id, number")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/os");
  return { osId: os.id, number: os.number };
}

// ---------- Status ----------
export async function setOsStatus(osId: string, status: string): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("service_orders")
    .update({ status })
    .eq("id", osId);
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath(`/os/${osId}`);
  revalidatePath("/os");
  return { ok: true };
}

export async function assignTechnician(osId: string, technicianId: string | null) {
  const { supabase } = await getSessionContext();
  await supabase.from("service_orders").update({ technician_id: technicianId }).eq("id", osId);
  revalidatePath(`/os/${osId}`);
}

// ---------- Diagnóstico ----------
export async function saveDiagnostic(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, userId } = await getSessionContext();
  const osId = String(formData.get("os_id"));

  const { error } = await supabase.from("os_diagnostics").insert({
    os_id: osId,
    found_issue: String(formData.get("found_issue") ?? "").trim(),
    probable_cause: String(formData.get("probable_cause") ?? "").trim() || null,
    procedure: String(formData.get("procedure") ?? "").trim() || null,
    classification: String(formData.get("classification") ?? "repairable"),
    oxidation: formData.get("oxidation") === "on",
    technician_id: userId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

// ---------- Orçamento ----------
export async function addQuoteItem(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const osId = String(formData.get("os_id"));
  const description = String(formData.get("description") ?? "").trim();
  const qty = parseDecimal(formData.get("qty")) || 1;
  const unitPrice = parseDecimal(formData.get("unit_price"));
  const kind = String(formData.get("kind") ?? "labor");
  const productId = String(formData.get("product_id") ?? "") || null;

  if (!description) return { error: "Descreva o item." };
  if (unitPrice <= 0) return { error: "Informe o preço." };

  // Usa o orçamento rascunho vigente ou cria a próxima versão
  let { data: quote } = await supabase
    .from("os_quotes")
    .select("id")
    .eq("os_id", osId)
    .eq("status", "draft")
    .maybeSingle();

  if (!quote) {
    const { data: last } = await supabase
      .from("os_quotes")
      .select("version")
      .eq("os_id", osId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: created, error } = await supabase
      .from("os_quotes")
      .insert({
        os_id: osId,
        version: (last?.version ?? 0) + 1,
        valid_until: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    quote = created;
  }

  const { error } = await supabase.from("os_quote_items").insert({
    quote_id: quote.id,
    kind,
    product_id: productId,
    description,
    qty,
    unit_price: unitPrice,
  });
  if (error) return { error: error.message };

  await recalcQuoteTotal(quote.id);
  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

async function recalcQuoteTotal(quoteId: string) {
  const { supabase } = await getSessionContext();
  const { data: items } = await supabase
    .from("os_quote_items")
    .select("qty, unit_price")
    .eq("quote_id", quoteId);
  const total = (items ?? []).reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0);
  await supabase.from("os_quotes").update({ total }).eq("id", quoteId);
}

export async function removeQuoteItem(itemId: string, quoteId: string, osId: string) {
  const { supabase } = await getSessionContext();
  await supabase.from("os_quote_items").delete().eq("id", itemId);
  await recalcQuoteTotal(quoteId);
  revalidatePath(`/os/${osId}`);
}

export async function sendQuote(quoteId: string, osId: string): Promise<ActionState> {
  const { supabase } = await getSessionContext();

  // Laudo é obrigatório antes de enviar orçamento ao cliente
  const { count } = await supabase
    .from("os_diagnostics")
    .select("id", { count: "exact", head: true })
    .eq("os_id", osId);
  if (!count) return { error: "Registre o diagnóstico antes de enviar o orçamento." };

  // Versões anteriores enviadas ficam superadas
  await supabase
    .from("os_quotes")
    .update({ status: "superseded" })
    .eq("os_id", osId)
    .eq("status", "sent");

  const { error } = await supabase
    .from("os_quotes")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", quoteId);
  if (error) return { error: error.message };

  const { error: stErr } = await supabase
    .from("service_orders")
    .update({ status: "awaiting_approval" })
    .eq("id", osId)
    .eq("status", "diagnosing");
  if (stErr) return { error: stErr.message.replace(/^.*?: /, "") };

  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

export async function decideQuoteInPerson(
  quoteId: string,
  osId: string,
  approve: boolean,
  reason?: string
): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase
    .from("os_quotes")
    .update({
      status: approve ? "approved" : "rejected",
      decided_at: new Date().toISOString(),
      approval_channel: "in_person",
      rejection_reason: approve ? null : reason || null,
    })
    .eq("id", quoteId)
    .eq("status", "sent");
  if (error) return { error: error.message };

  const { error: stErr } = await supabase
    .from("service_orders")
    .update({ status: approve ? "approved" : "unrepaired" })
    .eq("id", osId);
  if (stErr) return { error: stErr.message.replace(/^.*?: /, "") };

  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

// ---------- Peças ----------
export async function searchParts(term: string) {
  const { supabase } = await getSessionContext();
  if (term.trim().length < 2) return [];
  const { data } = await supabase
    .from("products")
    .select("id, name, sale_price, cost, stock_items(qty, reserved)")
    .eq("active", true)
    .in("type", ["part", "accessory"])
    .ilike("name", `%${term.trim()}%`)
    .limit(8);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.sale_price),
    available: (p.stock_items as { qty: number; reserved: number }[])
      .reduce((s, i) => s + Number(i.qty) - Number(i.reserved), 0),
  }));
}

export async function requestPart(
  osId: string, productId: string, qty: number, unitPrice: number
): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("os_request_part", {
    p_os: osId, p_product: productId, p_qty: qty, p_unit_price: unitPrice,
  });
  if (error) return { error: error.message };
  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

export async function applyPart(partId: string, osId: string): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("os_apply_part", { p_part: partId });
  if (error) return { error: error.message };
  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

export async function returnPart(partId: string, osId: string): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("os_return_part", { p_part: partId });
  if (error) return { error: error.message };
  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

// ---------- Comentários ----------
export async function addComment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, userId } = await getSessionContext();
  const osId = String(formData.get("os_id"));
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Escreva o comentário." };
  const { error } = await supabase.from("os_comments").insert({
    os_id: osId,
    message,
    internal: formData.get("internal") !== "off",
    user_id: userId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

// ---------- Cronômetro ----------
export async function toggleTimer(osId: string): Promise<ActionState> {
  const { supabase, userId } = await getSessionContext();
  const { data: open } = await supabase
    .from("os_labor_logs")
    .select("id, started_at")
    .eq("os_id", osId)
    .eq("technician_id", userId)
    .is("ended_at", null)
    .maybeSingle();

  if (open) {
    const minutes = Math.round((Date.now() - new Date(open.started_at).getTime()) / 60000);
    await supabase
      .from("os_labor_logs")
      .update({ ended_at: new Date().toISOString(), minutes })
      .eq("id", open.id);
  } else {
    await supabase.from("os_labor_logs").insert({ os_id: osId, technician_id: userId });
  }
  revalidatePath(`/os/${osId}`);
  return { ok: true };
}

// ---------- Entrega ----------
export async function deliverOs(input: {
  osId: string;
  deliveredTo?: string;
  payments: { kind: string; amount: number; installments?: number; changeGiven?: number }[];
}): Promise<{ error?: string; saleNumber?: number }> {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("deliver_os", {
    p: {
      os_id: input.osId,
      delivered_to: input.deliveredTo ?? null,
      payments: input.payments.map((p) => ({
        kind: p.kind,
        amount: p.amount,
        installments: p.installments ?? 1,
        change_given: p.changeGiven ?? 0,
      })),
    },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath(`/os/${input.osId}`);
  revalidatePath("/os");
  const r = data as { number: number | null };
  return { saleNumber: r.number ?? undefined };
}

export async function cancelOs(osId: string, reason: string): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  if (!reason.trim()) return { error: "Motivo é obrigatório para cancelar." };
  const { error } = await supabase
    .from("service_orders")
    .update({ status: "canceled", canceled_reason: reason })
    .eq("id", osId);
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath("/os");
  redirect("/os");
}
