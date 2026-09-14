"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export type EstadoConvite = { erro?: string; link?: string; token?: string };
export type Resultado = { erro?: string };

async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function criarConvite(_prev: EstadoConvite, formData: FormData): Promise<EstadoConvite> {
  const { supabase, companyId, userId } = await getSessionContext();
  const storeId = String(formData.get("store_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;

  if (!storeId || !roleId) return { erro: "Escolha a loja e o papel." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Confira o e-mail digitado." };

  const { data, error } = await supabase
    .from("company_invites")
    .insert({ company_id: companyId, store_id: storeId, role_id: roleId, email, created_by: userId })
    .select("token")
    .single();
  if (error || !data) {
    return {
      erro: error?.code === "42501"
        ? "Apenas o dono ou administradores podem convidar."
        : error?.message ?? "Não foi possível criar o convite.",
    };
  }
  revalidatePath("/admin");
  return { link: `${await origem()}/convite/${data.token}`, token: data.token };
}

export async function cancelarConvite(inviteId: string): Promise<Resultado> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("invite_revoke", { p_invite: inviteId });
  revalidatePath("/admin");
  return error ? { erro: error.message } : {};
}

export async function mudarPapel(userId: string, storeId: string, roleId: string): Promise<Resultado> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("team_set_role", { p_user: userId, p_store: storeId, p_role: roleId });
  revalidatePath("/admin");
  return error ? { erro: error.message } : {};
}

export async function removerMembro(userId: string): Promise<Resultado> {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("team_remove_member", { p_user: userId });
  revalidatePath("/admin");
  return error ? { erro: error.message } : {};
}
