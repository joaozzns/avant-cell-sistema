"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/context";

const BUCKET = "os-media";

export type FotoOs = {
  id: string;
  caminho: string;
  url: string;
  rotulo: string | null;
  criadaEm: string;
  autor: string | null;
};

/** Lista as fotos da OS com link temporário de visualização (1 hora). */
export async function fotosDaOs(osId: string): Promise<FotoOs[]> {
  const { supabase } = await getSessionContext();

  const { data } = await supabase
    .from("os_attachments")
    .select("id, url, label, created_at, profiles:created_by(full_name)")
    .eq("os_id", osId)
    .eq("kind", "photo")
    .order("created_at");
  if (!data?.length) return [];

  const caminhos = data.map((f) => f.url);
  const { data: assinados } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, 3600);
  const porCaminho = new Map((assinados ?? []).map((a) => [a.path, a.signedUrl]));

  return data.map((f) => ({
    id: f.id,
    caminho: f.url,
    url: porCaminho.get(f.url) ?? "",
    rotulo: f.label,
    criadaEm: f.created_at,
    autor: (f.profiles as { full_name?: string } | null)?.full_name ?? null,
  }));
}

/** Registra no banco a foto que o navegador acabou de enviar ao bucket. */
export async function registrarFoto(osId: string, caminho: string, rotulo: string) {
  const { supabase, userId, companyId } = await getSessionContext();

  if (!caminho.startsWith(`${companyId}/`)) return { error: "Caminho de arquivo inválido." };

  const { error } = await supabase.from("os_attachments").insert({
    os_id: osId, kind: "photo", url: caminho, label: rotulo || null, created_by: userId,
  });
  if (error) {
    // não deixa arquivo órfão no bucket se o registro falhar
    await supabase.storage.from(BUCKET).remove([caminho]);
    return { error: error.message };
  }
  revalidatePath(`/os/${osId}`);
  return {};
}

export async function removerFoto(osId: string, id: string) {
  const { supabase } = await getSessionContext();

  const { data: foto } = await supabase
    .from("os_attachments").select("url").eq("id", id).maybeSingle();
  if (!foto) return { error: "Foto não encontrada." };

  const { error } = await supabase.from("os_attachments").delete().eq("id", id);
  if (error) return { error: error.message };

  await supabase.storage.from(BUCKET).remove([foto.url]);
  revalidatePath(`/os/${osId}`);
  return {};
}
