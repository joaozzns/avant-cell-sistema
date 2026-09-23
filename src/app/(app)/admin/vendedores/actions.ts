"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { mensagemDoBanco } from "@/lib/erro-banco";

const CAMINHO = "/admin/vendedores";

export async function definirPrincipal(userId: string, principal: boolean) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("seller_set_primary", {
    p_user: userId, p_flag: principal,
  });
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Trocar o link invalida o anterior na hora — é o que se faz quando alguém
 *  sai da equipe com o link no celular. */
export async function trocarLink(userId: string) {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("seller_link_rotate", { p_user: userId });
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true, token: (data as { token?: string })?.token };
}
