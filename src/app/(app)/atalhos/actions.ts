"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";
import { mensagemDoBanco } from "@/lib/erro-banco";
import { CATALOGO } from "@/lib/atalhos";

export async function salvarAtalhos(escolhidos: string[]) {
  const { supabase, userId } = await getSessionContext();

  /* só ids que existem no catálogo: a tela manda o que mostrou, mas quem
     chama a ação pode mandar qualquer coisa */
  const validos = escolhidos.filter((id) => CATALOGO.some((a) => a.id === id));

  /* lista vazia é como "nunca escolheu": o painel voltaria ao conjunto padrão
     e a escolha pareceria não ter sido salva */
  if (!validos.length) return { error: "Deixe pelo menos um atalho no painel." };

  const { error } = await supabase
    .from("user_shortcuts")
    .upsert({ user_id: userId, items: validos, updated_at: new Date().toISOString() });

  if (error) return { error: mensagemDoBanco(error.message) };
  revalidatePath("/dashboard");
  revalidatePath("/atalhos");
  return { ok: true };
}
