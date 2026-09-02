"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { emitDocument } from "@/lib/fiscal";

export type ActionState = { error?: string; ok?: boolean };

async function getGateway(supabase: Awaited<ReturnType<typeof getSessionContext>>["supabase"]) {
  const { data } = await supabase
    .from("integrations")
    .select("config, status")
    .eq("kind", "fiscal_gateway")
    .eq("status", "connected")
    .maybeSingle();
  return (data?.config ?? null) as { provider?: string; token?: string; environment?: string } | null;
}

export async function issueInvoiceForSale(
  saleId: string,
  kind: "nfce" | "nfe"
): Promise<ActionState> {
  const { supabase, companyId, storeId } = await getSessionContext();

  const { data: sale } = await supabase
    .from("sales")
    .select("id, number, total, status, fiscal_doc_id, store_id, sale_items(qty, unit_price, total, products(name, type, fiscal))")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return { error: "Venda não encontrada." };
  if (sale.status !== "completed") return { error: "Só é possível faturar venda concluída." };
  if (sale.fiscal_doc_id) return { error: "Esta venda já tem documento fiscal." };

  // Produto sem NCM não é faturado — o sistema avisa antes
  const items = sale.sale_items as unknown as { qty: number; unit_price: number; total: number;
    products: { name: string; type: string; fiscal: Record<string, string> } | null }[];
  const missingNcm = items.filter(
    (i) => i.products?.type !== "service" && !(i.products?.fiscal?.ncm));
  if (missingNcm.length > 0) {
    return {
      error: "Produtos sem NCM: " +
        missingNcm.map((i) => i.products?.name).join(", ") +
        ". Preencha o campo fiscal no cadastro antes de emitir.",
    };
  }

  const { data: settings } = await supabase
    .from("fiscal_settings")
    .select("environment, series")
    .eq("company_id", companyId)
    .maybeSingle();

  const gateway = await getGateway(supabase);
  const result = await emitDocument({
    gateway,
    kind,
    payload: {
      natureza_operacao: "VENDA",
      itens: items.map((i, idx) => ({
        numero_item: idx + 1,
        descricao: i.products?.name,
        quantidade: Number(i.qty),
        valor_unitario: Number(i.unit_price),
        codigo_ncm: i.products?.fiscal?.ncm,
      })),
      valor_total: Number(sale.total),
    },
  });

  const { data: number } = await supabase.rpc("next_store_number", {
    p_store: storeId, p_kind: kind,
  });

  const { data: doc, error } = await supabase
    .from("fiscal_documents")
    .insert({
      company_id: companyId,
      store_id: sale.store_id,
      kind,
      status: result.status,
      number,
      series: (settings?.series as Record<string, string> | null)?.[kind] ?? "1",
      environment: result.simulated ? "homolog" : (settings?.environment ?? "homolog"),
      sale_id: sale.id,
      total: sale.total,
      access_key: result.accessKey ?? null,
      protocol: result.protocol ?? null,
      rejection_reason: result.rejectionReason ?? null,
      issued_at: result.status === "authorized" ? new Date().toISOString() : null,
      gateway_payload: result.simulated ? { simulated: true } : null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase.from("sales").update({ fiscal_doc_id: doc.id }).eq("id", saleId);

  revalidatePath(`/pdv/vendas/${saleId}`);
  revalidatePath("/fiscal");
  if (result.status === "rejected") {
    return { error: "Nota rejeitada: " + result.rejectionReason };
  }
  return { ok: true };
}

export async function cancelDocument(
  docId: string, reason: string
): Promise<ActionState> {
  const { supabase } = await getSessionContext();
  if (reason.trim().length < 15) {
    return { error: "A justificativa de cancelamento precisa de pelo menos 15 caracteres." };
  }
  const { error } = await supabase
    .from("fiscal_documents")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: reason,
    })
    .eq("id", docId)
    .eq("status", "authorized");
  if (error) return { error: error.message };
  revalidatePath("/fiscal");
  return { ok: true };
}

export async function saveFiscalSettings(
  _prev: ActionState, formData: FormData
): Promise<ActionState> {
  const { supabase, companyId } = await getSessionContext();

  const { error } = await supabase.from("fiscal_settings").upsert(
    {
      company_id: companyId,
      store_id: null,
      tax_regime: String(formData.get("tax_regime") ?? "") || null,
      environment: String(formData.get("environment") ?? "homolog"),
      default_csosn: String(formData.get("default_csosn") ?? "") || null,
      iss_rate: Number(String(formData.get("iss_rate") ?? "").replace(",", ".")) || null,
      service_code: String(formData.get("service_code") ?? "") || null,
      series: {
        nfce: String(formData.get("series_nfce") ?? "1"),
        nfe: String(formData.get("series_nfe") ?? "1"),
        nfse: String(formData.get("series_nfse") ?? "1"),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,store_id" }
  );
  if (error) return { error: error.message };

  const provider = String(formData.get("gateway_provider") ?? "");
  const token = String(formData.get("gateway_token") ?? "").trim();
  if (provider && token) {
    await supabase.from("integrations").upsert(
      {
        company_id: companyId,
        kind: "fiscal_gateway",
        name: provider,
        config: {
          provider,
          token,
          environment: String(formData.get("environment") ?? "homolog"),
        },
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,kind,name" }
    );
  }

  revalidatePath("/fiscal/configuracoes");
  return { ok: true };
}
