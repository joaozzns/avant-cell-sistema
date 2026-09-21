import { getSessionContext } from "@/lib/context";
import { EditorModelos, type Modelo } from "./editor";

export default async function ModelosPage() {
  const { supabase, companyId } = await getSessionContext();

  const { data } = await supabase
    .from("message_templates")
    .select("id, key, name, body, auto_on_status, active")
    .eq("company_id", companyId)
    .order("name");

  const modelos: Modelo[] = (data ?? []).map((m) => ({
    id: m.id as string,
    key: m.key as string,
    name: m.name as string,
    body: m.body as string,
    auto_on_status: (m.auto_on_status as string | null) ?? null,
    active: Boolean(m.active),
  }));

  return <EditorModelos modelos={modelos} />;
}
