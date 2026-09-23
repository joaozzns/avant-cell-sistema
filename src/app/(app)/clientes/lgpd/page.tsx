import { getSessionContext } from "@/lib/context";
import { PainelLgpd, type PedidoLgpd } from "./painel";

export default async function LgpdPage() {
  const { supabase, companyId } = await getSessionContext();

  const [{ data: pedidos }, { count: anonimizados }] = await Promise.all([
    supabase
      .from("lgpd_requests")
      .select("id, kind, status, requested_at, due_at, completed_at, notes, customer_id, customers(name, cpf_cnpj, anonymized)")
      .eq("company_id", companyId)
      .order("requested_at", { ascending: false })
      .limit(100),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("anonymized", true),
  ]);

  const lista: PedidoLgpd[] = (pedidos ?? []).map((p) => {
    const c = p.customers as unknown as { name?: string; cpf_cnpj?: string; anonymized?: boolean } | null;
    return {
      id: p.id as string,
      clienteId: p.customer_id as string,
      cliente: c?.name ?? "—",
      documento: c?.cpf_cnpj ?? null,
      jaAnonimizado: Boolean(c?.anonymized),
      tipo: p.kind as string,
      situacao: p.status as string,
      pedidoEm: p.requested_at as string,
      prazo: (p.due_at as string | null) ?? null,
      concluidoEm: (p.completed_at as string | null) ?? null,
      observacao: (p.notes as string | null) ?? null,
    };
  });

  return <PainelLgpd pedidos={lista} anonimizados={anonimizados ?? 0} />;
}
