"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { mensagemDoBanco } from "@/lib/erro-banco";

export type EstadoLoja = { erro?: string; ok?: boolean };

const soNumeros = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\D/g, "");

function conferir(cnpj: string, telefone: string): string | undefined {
  if (cnpj && cnpj.length !== 14) return "O CNPJ tem 14 números. Confira ou deixe em branco.";
  if (telefone && (telefone.length < 10 || telefone.length > 11)) {
    return "Informe o telefone com DDD, ou deixe em branco.";
  }
}

export async function criarLoja(_prev: EstadoLoja, formData: FormData): Promise<EstadoLoja> {
  const { supabase } = await getSessionContext();
  const nome = String(formData.get("nome") ?? "").trim();
  const cnpj = soNumeros(formData.get("cnpj"));
  const telefone = soNumeros(formData.get("telefone"));

  if (!nome) return { erro: "Informe o nome da loja." };
  const problema = conferir(cnpj, telefone);
  if (problema) return { erro: problema };

  const { error } = await supabase.rpc("criar_loja", {
    p_nome: nome, p_cnpj: cnpj || null, p_telefone: telefone || null,
  });
  if (error) {
    /* a migração ainda não rodou neste banco */
    if (error.code === "PGRST202") return { erro: "A criação de lojas ainda não foi ativada. Fale com o suporte." };
    return { erro: mensagemDoBanco(error.message) };
  }
  /* o seletor de loja do topo vem do layout: precisa recarregar */
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function editarLoja(_prev: EstadoLoja, formData: FormData): Promise<EstadoLoja> {
  const { supabase, companyId } = await getSessionContext();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const cnpj = soNumeros(formData.get("cnpj"));
  const telefone = soNumeros(formData.get("telefone"));

  if (!id) return { erro: "Loja não encontrada." };
  if (!nome) return { erro: "Informe o nome da loja." };
  const problema = conferir(cnpj, telefone);
  if (problema) return { erro: problema };

  const { data, error } = await supabase.from("stores")
    .update({ name: nome, cnpj: cnpj || null, phone: telefone || null })
    .eq("id", id).eq("company_id", companyId)
    .select("id");
  if (error) return { erro: mensagemDoBanco(error.message) };
  if (!data?.length) return { erro: "Apenas o dono ou administradores podem alterar lojas." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function alternarLoja(id: string, ativa: boolean): Promise<EstadoLoja> {
  const { supabase, companyId, storeId } = await getSessionContext();

  if (!ativa) {
    /* desativar a última loja ativa deixaria a empresa sem onde vender, e
       quem estivesse só nela cairia na tela de criar empresa */
    const { count } = await supabase.from("stores")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("active", true);
    if ((count ?? 0) <= 1) return { erro: "Esta é a única loja ativa. Crie outra antes de desativar esta." };
    if (id === storeId) return { erro: "Você está nesta loja agora. Troque de loja no topo da tela antes de desativá-la." };
  }

  const { data, error } = await supabase.from("stores")
    .update({ active: ativa }).eq("id", id).eq("company_id", companyId).select("id");
  if (error) return { erro: mensagemDoBanco(error.message) };
  if (!data?.length) return { erro: "Apenas o dono ou administradores podem alterar lojas." };
  revalidatePath("/", "layout");
  return { ok: true };
}
