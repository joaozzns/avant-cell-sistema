import { getSessionContext } from "@/lib/context";
import { FilaAvisos, type Aviso } from "./fila";

export default async function AvisosPage() {
  const { supabase, companyId } = await getSessionContext();

  const { data } = await supabase
    .from("messages")
    .select("id, body, status, error, template_key, created_at, ref_table, ref_id, customers(name, phone, whatsapp)")
    .eq("company_id", companyId)
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(120);

  const linhas = data ?? [];

  /* messages.ref_id é um ponteiro solto (serve para OS, venda ou cobrança),
     então o número da OS vem numa consulta à parte */
  const osIds = [...new Set(linhas.filter((m) => m.ref_table === "service_orders" && m.ref_id).map((m) => m.ref_id as string))];
  const numeros = new Map<string, number>();
  if (osIds.length) {
    const { data: oss } = await supabase.from("service_orders").select("id, number").in("id", osIds);
    for (const o of oss ?? []) numeros.set(o.id as string, o.number as number);
  }

  const { data: modelos } = await supabase
    .from("message_templates")
    .select("key, name")
    .eq("company_id", companyId);
  const nomeModelo = new Map((modelos ?? []).map((m) => [m.key as string, m.name as string]));

  const avisos: Aviso[] = linhas.map((m) => {
    const c = m.customers as unknown as { name?: string; phone?: string; whatsapp?: string } | null;
    return {
      id: m.id as string,
      cliente: c?.name ?? "—",
      telefone: c?.whatsapp ?? c?.phone ?? null,
      corpo: m.body as string,
      situacao: m.status as string,
      erro: (m.error as string | null) ?? null,
      modelo: nomeModelo.get(m.template_key as string) ?? (m.template_key as string) ?? "Mensagem",
      criado: m.created_at as string,
      osId: m.ref_table === "service_orders" ? (m.ref_id as string | null) : null,
      osNumero: m.ref_id ? (numeros.get(m.ref_id as string) ?? null) : null,
    };
  });

  return <FilaAvisos avisos={avisos} />;
}
