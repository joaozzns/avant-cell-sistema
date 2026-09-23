"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

export async function publicarTermo(tipo: string, texto: string) {
  const { supabase } = await getSessionContext();
  const { data, error } = await supabase.rpc("term_publish", {
    p: { kind: tipo, body: texto },
  });
  if (error) return { error: error.message.replace(/^.*?: /, "") };

  revalidatePath("/admin/termos");
  return { ok: true, versao: (data as { version?: number })?.version };
}
