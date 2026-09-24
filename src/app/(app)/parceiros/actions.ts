"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { mensagemDoBanco } from "@/lib/erro-banco";

const CAMINHO = "/parceiros";

export async function criarRepresentante(entrada: { nome: string; email: string; telefone: string }) {
  const { supabase } = await getSessionContext();
  if (!entrada.nome.trim()) return { error: "Diga o nome do representante." };

  const { error } = await supabase.from("partners").insert({
    name: entrada.nome.trim(),
    email: entrada.email.trim() || null,
    phone: entrada.telefone.trim() || null,
  });
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function trocarLinkRepresentante(id: string) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("partner_link_rotate", { p_partner: id });
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function definirRepresentantePrincipal(id: string, principal: boolean) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.rpc("partner_set_primary", { p_partner: id, p_flag: principal });
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function desativarRepresentante(id: string, ativo: boolean) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("partners").update({ active: ativo }).eq("id", id);
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Assinatura de uma loja: plano, valor, situação e de quem foi a venda. */
export async function salvarAssinatura(entrada: {
  empresaId: string;
  representanteId: string | null;
  valor: number;
  situacao: string;
  plano: string | null;
}) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("subscriptions").upsert(
    {
      company_id: entrada.empresaId,
      partner_id: entrada.representanteId,
      monthly_amount: entrada.valor,
      status: entrada.situacao,
      plan_id: entrada.plano,
      canceled_at: entrada.situacao === "canceled" ? new Date().toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** O modelo de comissão — a decisão que o dono ainda vai tomar. */
export async function definirModeloComissao(entrada: {
  tipo: string; percentual: number | null; fixo: number | null;
}) {
  const { supabase } = await getSessionContext();
  const { error } = await supabase.from("partner_settings").update({
    commission_kind: entrada.tipo || null,
    percent: entrada.percentual,
    fixed_amount: entrada.fixo,
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}
