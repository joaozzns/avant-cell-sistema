"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export type EnvioExterno = {
  id: string;
  parceiro: string;
  fornecedorId: string | null;
  situacao: string;
  enviadoEm: string;
  prazo: string | null;
  recebidoEm: string | null;
  custoCombinado: number | null;
  custoReal: number | null;
  rastreio: string | null;
  divergencia: string | null;
  observacao: string | null;
  contaId: string | null;
};

export async function enviosDaOs(osId: string): Promise<EnvioExterno[]> {
  const { supabase } = await getSessionContext();
  const { data } = await supabase
    .from("os_external_services")
    .select("id, partner_name, supplier_id, status, sent_at, promised_at, received_at, agreed_cost, actual_cost, tracking_code, divergence, notes, payable_id")
    .eq("os_id", osId)
    .order("sent_at", { ascending: false });

  return (data ?? []).map((e) => ({
    id: e.id as string,
    parceiro: e.partner_name as string,
    fornecedorId: (e.supplier_id as string | null) ?? null,
    situacao: e.status as string,
    enviadoEm: e.sent_at as string,
    prazo: (e.promised_at as string | null) ?? null,
    recebidoEm: (e.received_at as string | null) ?? null,
    custoCombinado: e.agreed_cost === null ? null : Number(e.agreed_cost),
    custoReal: e.actual_cost === null ? null : Number(e.actual_cost),
    rastreio: (e.tracking_code as string | null) ?? null,
    divergencia: (e.divergence as string | null) ?? null,
    observacao: (e.notes as string | null) ?? null,
    contaId: (e.payable_id as string | null) ?? null,
  }));
}

export async function fornecedoresAtivos() {
  const { supabase } = await getSessionContext();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("active", true)
    .order("name");
  return (data ?? []).map((s) => ({ id: s.id as string, nome: s.name as string }));
}

export async function enviarParaLaboratorio(entrada: {
  osId: string;
  fornecedorId: string | null;
  parceiro: string;
  prazo: string | null;
  custo: number | null;
  rastreio: string;
  observacao: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("os_external_send", {
    p: {
      os_id: entrada.osId,
      supplier_id: entrada.fornecedorId,
      partner_name: entrada.parceiro,
      promised_at: entrada.prazo,
      agreed_cost: entrada.custo,
      tracking_code: entrada.rastreio,
      notes: entrada.observacao,
    },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath(`/os/${entrada.osId}`);
  revalidatePath("/os/laboratorio");
  return { ok: true };
}

export async function atualizarEnvio(entrada: {
  id: string;
  osId: string;
  situacao: string;
  custo?: number | null;
  divergencia?: string;
  prazo?: string | null;
  rastreio?: string;
  vencimento?: string | null;
}): Promise<{ error?: string; ok?: boolean }> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("os_external_update", {
    p: {
      id: entrada.id,
      status: entrada.situacao,
      cost: entrada.custo ?? null,
      divergence: entrada.divergencia ?? null,
      promised_at: entrada.prazo ?? null,
      tracking_code: entrada.rastreio ?? null,
      due_date: entrada.vencimento ?? null,
    },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };
  revalidatePath(`/os/${entrada.osId}`);
  revalidatePath("/os/laboratorio");
  revalidatePath("/financeiro/pagar");
  return { ok: true };
}
