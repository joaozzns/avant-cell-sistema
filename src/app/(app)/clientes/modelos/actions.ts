"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { MODELOS_PADRAO } from "@/lib/mensagens";

const CAMINHO = "/clientes/modelos";

/** Instala os textos prontos. Serve para a loja começar com algo que funciona
 *  e ir ajustando — ninguém quer escrever dez mensagens do zero no primeiro dia. */
export async function instalarModelosPadrao() {
  const { supabase, companyId } = await getSessionContext();

  const { data: existentes } = await supabase
    .from("message_templates")
    .select("key, name, auto_on_status, active")
    .eq("company_id", companyId);
  const jaTem = new Set((existentes ?? []).map((m) => m.key as string));

  const entrando = MODELOS_PADRAO.filter((m) => !jaTem.has(m.key));

  /* Dois modelos automáticos na mesma situação = duas mensagens para o cliente.
     O texto novo assume o gatilho e o antigo continua existindo, só que para
     envio manual — ninguém perde o que escreveu. */
  const gatilhosNovos = entrando.map((m) => m.auto_on_status).filter(Boolean) as string[];
  const desativados = (existentes ?? [])
    .filter((m) => m.active && m.auto_on_status && gatilhosNovos.includes(m.auto_on_status as string))
    .map((m) => m.key as string);
  if (desativados.length) {
    await supabase
      .from("message_templates")
      .update({ auto_on_status: null })
      .eq("company_id", companyId)
      .in("key", desativados);
  }

  const novos = entrando.map((m) => ({
    company_id: companyId,
    key: m.key,
    name: m.name,
    channel: "whatsapp",
    body: m.body,
    auto_on_status: m.auto_on_status,
    active: true,
  }));
  if (!novos.length) return { instalados: 0, manuais: 0 };

  const { error } = await supabase.from("message_templates").insert(novos);
  if (error) return { error: error.message };

  revalidatePath(CAMINHO);
  return { instalados: novos.length, manuais: desativados.length };
}

export async function salvarModelo(entrada: {
  id?: string;
  key: string;
  name: string;
  body: string;
  auto_on_status: string | null;
  active: boolean;
}) {
  const { supabase, companyId } = await getSessionContext();
  if (!entrada.name.trim()) return { error: "Dê um nome ao modelo." };
  if (!entrada.body.trim()) return { error: "A mensagem não pode ficar vazia." };

  /* duas mensagens automáticas na mesma situação virariam duas mensagens
     para o cliente: a que está sendo salva assume, a outra sai do automático */
  if (entrada.auto_on_status && entrada.active) {
    await supabase
      .from("message_templates")
      .update({ auto_on_status: null })
      .eq("company_id", companyId)
      .eq("auto_on_status", entrada.auto_on_status)
      .neq("key", entrada.key);
  }

  const { error } = await supabase.from("message_templates").upsert(
    {
      company_id: companyId,
      key: entrada.key,
      name: entrada.name.trim(),
      channel: "whatsapp",
      body: entrada.body.trim(),
      auto_on_status: entrada.auto_on_status,
      active: entrada.active,
    },
    { onConflict: "company_id,key" },
  );
  if (error) return { error: error.message };

  revalidatePath(CAMINHO);
  return { ok: true };
}
