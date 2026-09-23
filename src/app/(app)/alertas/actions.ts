"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { mensagemDoBanco } from "@/lib/erro-banco";

const CAMINHO = "/alertas";

/** Recalcula a partir dos dados de hoje: nada aqui é digitado à mão. */
export async function recalcular() {
  const { supabase, storeId } = await getSessionContext();
  const { data, error } = await supabase.rpc("alerts_refresh", { p: { store_id: storeId } });
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  revalidatePath("/dashboard");
  return {
    novos: Number((data as { novos?: number })?.novos ?? 0),
    resolvidos: Number((data as { resolvidos?: number })?.resolvidos ?? 0),
  };
}

export async function resolver(id: string) {
  const { supabase, userId } = await getSessionContext();
  const { error } = await supabase
    .from("alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Adiar é diferente de resolver: o problema continua, só não é para agora. */
export async function adiar(id: string, dias: number) {
  const { supabase } = await getSessionContext();
  const ate = new Date();
  ate.setDate(ate.getDate() + dias);
  const { error } = await supabase
    .from("alerts")
    .update({ status: "snoozed", snooze_until: ate.toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  revalidatePath("/dashboard");
  return { ok: true };
}
