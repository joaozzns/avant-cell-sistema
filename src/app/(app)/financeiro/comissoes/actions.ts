"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

const CAMINHO = "/financeiro/comissoes";

export async function apurarComissao(periodo: string) {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("commission_accrue", { p_period: periodo });
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  const r = data as { lancamentos: number; total: number };
  return { lancamentos: r.lancamentos, total: Number(r.total) };
}

export async function mudarSituacao(periodo: string, usuario: string | null, situacao: string) {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("commission_set_status", {
    p_period: periodo, p_user: usuario, p_status: situacao,
  });
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return { atualizados: (data as { atualizados: number }).atualizados };
}

export async function salvarRegra(input: {
  id?: string; nome: string; base: string; taxa: number; fixo: number; soQuandoPago: boolean;
}) {
  const { supabase, companyId } = await getSessionContext();
  if (!input.nome.trim()) return { error: "Dê um nome à regra." };
  if (input.base !== "fixed_per_os" && input.taxa <= 0) return { error: "Informe o percentual." };
  if (input.base === "fixed_per_os" && input.fixo <= 0) return { error: "Informe o valor por OS." };

  const linha = {
    company_id: companyId,
    name: input.nome.trim(),
    base: input.base,
    rate: input.base === "fixed_per_os" ? null : input.taxa,
    fixed_amount: input.base === "fixed_per_os" ? input.fixo : null,
    only_when_paid: input.soQuandoPago,
    active: true,
  };
  const { error } = input.id
    ? await supabase.from("commission_rules").update(linha).eq("id", input.id)
    : await supabase.from("commission_rules").insert(linha);
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return {};
}

export async function alternarRegra(id: string, ativa: boolean) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("commission_rules").update({ active: ativa }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return {};
}

export async function salvarMeta(periodo: string, usuario: string, alvo: number, bonus: number) {
  const { supabase, companyId, storeId } = await getSessionContext();
  if (alvo <= 0) return { error: "Informe o valor da meta." };
  const { error } = await supabase.from("goals").upsert({
    company_id: companyId, store_id: storeId, user_id: usuario,
    period: periodo, target: alvo, bonus: bonus || null,
  }, { onConflict: "company_id,store_id,user_id,period" });
  if (error) return { error: error.message };
  revalidatePath(CAMINHO);
  return {};
}
