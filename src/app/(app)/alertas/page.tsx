import { getSessionContext } from "@/lib/context";
import { PainelAlertas, type Alerta } from "./painel";

export default async function AlertasPage() {
  const { supabase, companyId } = await getSessionContext();

  const { data } = await supabase
    .from("alerts")
    .select("id, kind, severity, title, body, ref_table, ref_id, status, snooze_until, created_at, resolved_at")
    .eq("company_id", companyId)
    .in("status", ["open", "snoozed", "resolved"])
    .order("created_at", { ascending: false })
    .limit(200);

  const alertas: Alerta[] = (data ?? []).map((a) => ({
    id: a.id as string,
    tipo: a.kind as string,
    gravidade: (a.severity as string) ?? "warning",
    titulo: a.title as string,
    corpo: (a.body as string | null) ?? null,
    refTabela: (a.ref_table as string | null) ?? null,
    refId: (a.ref_id as string | null) ?? null,
    situacao: a.status as string,
    adiadoAte: (a.snooze_until as string | null) ?? null,
    criadoEm: a.created_at as string,
    resolvidoEm: (a.resolved_at as string | null) ?? null,
  }));

  return <PainelAlertas alertas={alertas} />;
}
