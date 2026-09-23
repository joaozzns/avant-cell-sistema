import { getSessionContext } from "@/lib/context";
import { EditorTermos, type TermoSalvo } from "./editor";

export default async function TermosPage() {
  const { supabase, companyId } = await getSessionContext();

  const { data } = await supabase
    .from("terms")
    .select("kind, version, body, active, created_at, profiles:created_by(full_name)")
    .eq("company_id", companyId)
    .order("version", { ascending: false });

  const termos: TermoSalvo[] = (data ?? []).map((t) => ({
    tipo: t.kind as string,
    versao: t.version as number,
    texto: t.body as string,
    ativo: Boolean(t.active),
    criadoEm: t.created_at as string,
    autor: (t.profiles as unknown as { full_name?: string } | null)?.full_name ?? null,
  }));

  return <EditorTermos termos={termos} />;
}
