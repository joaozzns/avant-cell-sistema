"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { enfileirarAvisoPorModelo } from "@/lib/avisos";

const CAMINHO = "/clientes/avisos";

/** O atendente enviou (pelo WhatsApp Web ou pessoalmente). Guardamos o texto
 *  exato que saiu — se ele ajustou a mensagem, é a versão ajustada que fica. */
export async function marcarEnviado(id: string, corpo?: string) {
  const { supabase, userId } = await getSessionContext();
  const { error } = await supabase
    .from("messages")
    .update({ status: "sent", user_id: userId, ...(corpo ? { body: corpo } : {}) })
    .eq("id", id)
    .eq("status", "queued");
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Aviso que não faz sentido mandar (cliente já veio buscar, ligou antes…).
 *  Fica registrado como não enviado, com o motivo — ninguém apaga histórico. */
export async function descartarAviso(id: string) {
  const { supabase, userId } = await getSessionContext();
  const { error } = await supabase
    .from("messages")
    .update({ status: "failed", error: "Descartado pelo atendente", user_id: userId })
    .eq("id", id)
    .eq("status", "queued");
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Aviso escrito na mão a partir de um modelo, direto da tela da OS. */
export async function avisarPorModelo(osId: string, key: string): Promise<{ error?: string; ok?: boolean }> {
  const { supabase, companyId, userId } = await getSessionContext();
  const r = await enfileirarAvisoPorModelo(supabase, { osId, key, companyId, userId });
  if (r.error) return r;
  revalidatePath(`/os/${osId}`);
  revalidatePath(CAMINHO);
  return { ok: true };
}
