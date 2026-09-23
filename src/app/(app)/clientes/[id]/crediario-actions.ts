"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { mensagemDoBanco } from "@/lib/erro-banco";

export type SituacaoCrediario = {
  limite: number;
  usado: number;
  disponivel: number;
  bloqueado: boolean;
  motivo: string | null;
  vencidaEm: string | null;
};

export async function situacaoCrediario(clienteId: string): Promise<SituacaoCrediario> {
  const { supabase } = await getSessionContext();
  const { data } = await supabase.rpc("credit_status", { p_customer: clienteId });
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    limite: Number(d.limite ?? 0),
    usado: Number(d.usado ?? 0),
    disponivel: Number(d.disponivel ?? 0),
    bloqueado: Boolean(d.bloqueado),
    motivo: (d.motivo as string | null) ?? null,
    vencidaEm: (d.vencida_em as string | null) ?? null,
  };
}

export async function definirLimite(entrada: {
  clienteId: string;
  limite: number;
  bloqueado: boolean;
  motivoBloqueio: string;
  rendaDeclarada: number | null;
  observacao: string;
  justificativa: string;
}) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("credit_profile_set", {
    p: {
      customer_id: entrada.clienteId,
      credit_limit: entrada.limite,
      blocked: entrada.bloqueado,
      blocked_reason: entrada.motivoBloqueio,
      declared_income: entrada.rendaDeclarada,
      notes: entrada.observacao,
      reason: entrada.justificativa,
    },
  });
  if (error) return { error: mensagemDoBanco(error.message) };

  revalidatePath(`/clientes/${entrada.clienteId}`);
  revalidatePath("/financeiro/receber");
  return { ok: true };
}
