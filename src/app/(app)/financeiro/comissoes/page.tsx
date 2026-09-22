import { getSessionContext } from "@/lib/context";
import { isoLocal } from "@/lib/format";
import { PainelComissoes, type LinhaVendedor, type Regra } from "./painel";

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const { supabase, companyId } = await getSessionContext();
  const mes = /^\d{4}-\d{2}$/.test(periodo ?? "") ? periodo! : isoLocal().slice(0, 7);

  const inicio = `${mes}-01`;
  const fim = isoLocal(
    new Date(new Date(`${inicio}T00:00:00`).setMonth(new Date(`${inicio}T00:00:00`).getMonth() + 1)),
  );

  const [{ data: lancamentos }, { data: regras }, { data: metas }, { data: vendas }, { data: equipe }] =
    await Promise.all([
      supabase.from("commission_entries")
        .select("user_id, amount, base_amount, status, profiles:user_id(full_name)")
        .eq("period", mes),
      supabase.from("commission_rules")
        .select("id, name, base, rate, fixed_amount, only_when_paid, active")
        .eq("company_id", companyId).order("name"),
      supabase.from("goals").select("user_id, target, bonus").eq("period", mes),
      supabase.from("sales")
        .select("seller_id, total")
        .in("status", ["completed", "partially_returned"])
        .gte("completed_at", inicio).lt("completed_at", fim),
      supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
    ]);

  const porVendedor = new Map<string, LinhaVendedor>();
  const nome = (id: string) => equipe?.find((p) => p.id === id)?.full_name ?? "—";

  for (const v of vendas ?? []) {
    if (!v.seller_id) continue;
    const l = porVendedor.get(v.seller_id) ?? vazio(v.seller_id, nome(v.seller_id));
    l.vendido += Number(v.total);
    porVendedor.set(v.seller_id, l);
  }
  for (const c of lancamentos ?? []) {
    const l = porVendedor.get(c.user_id) ?? vazio(c.user_id, nome(c.user_id));
    const valor = Number(c.amount);
    l.comissao += valor;
    if (c.status === "accrued") l.emAberto += valor;
    if (c.status === "approved") l.aprovado += valor;
    if (c.status === "paid") l.pago += valor;
    porVendedor.set(c.user_id, l);
  }
  for (const m of metas ?? []) {
    if (!m.user_id) continue;
    const l = porVendedor.get(m.user_id) ?? vazio(m.user_id, nome(m.user_id));
    l.meta = Number(m.target);
    l.bonus = Number(m.bonus ?? 0);
    porVendedor.set(m.user_id, l);
  }

  const linhas = [...porVendedor.values()].sort((a, b) => b.vendido - a.vendido);

  return (
    <PainelComissoes
      periodo={mes}
      linhas={linhas}
      regras={(regras ?? []) as Regra[]}
      equipe={(equipe ?? []).map((p) => ({ id: p.id, nome: p.full_name ?? "—" }))}
    />
  );
}

function vazio(id: string, nome: string): LinhaVendedor {
  return { id, nome, vendido: 0, comissao: 0, emAberto: 0, aprovado: 0, pago: 0, meta: 0, bonus: 0 };
}
