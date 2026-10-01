"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { mensagemDoBanco } from "@/lib/erro-banco";

/** Marca a comissão como repassada ao representante — ou desfaz, se foi engano. */
export async function marcarComissao(id: string, paga: boolean) {
  const { supabase, userId } = await getSessionContext();

  const { data: eu } = await supabase
    .from("profiles").select("is_staff").eq("id", userId).maybeSingle();
  if (!eu?.is_staff) return { error: "Área restrita à equipe Avant Cell." };

  const { error } = await supabase
    .from("partner_earnings")
    .update({ paid_at: paga ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath("/cobranca");
  return { ok: true };
}
