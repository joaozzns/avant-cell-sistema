import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { PainelCobranca, type LinhaAssinatura, type LinhaComissao } from "./painel";

export const metadata = { title: "Cobrança" };

export default async function CobrancaPage() {
  const { supabase, userId } = await getSessionContext();

  /* área do dono do Avant Cell: aqui se vê o que cada loja paga */
  const { data: eu } = await supabase
    .from("profiles").select("is_staff").eq("id", userId).maybeSingle();
  if (!eu?.is_staff) redirect("/dashboard");

  const [{ data: assinaturas }, { data: comissoes }] = await Promise.all([
    supabase
      .from("subscriptions")
      /* uma string literal só: o supabase-js infere os tipos lendo o texto do
         select, e concatenação derruba essa inferência */
      .select("id, status, charge_period, monthly_amount, charged_amount, current_period_end, grace_until, last_payment_at, started_at, mp_preapproval_id, companies(name, trade_name), saas_plans(name), partners(name)")
      .order("status"),
    supabase
      .from("partner_earnings")
      .select("id, amount, basis, earned_at, paid_at, partners(name), companies(name, trade_name)")
      .order("earned_at", { ascending: false })
      .limit(200),
  ]);

  const linhas: LinhaAssinatura[] = (assinaturas ?? []).map((a) => {
    const empresa = a.companies as unknown as { name?: string; trade_name?: string } | null;
    const plano = a.saas_plans as unknown as { name?: string } | null;
    const rep = a.partners as unknown as { name?: string } | null;
    return {
      id: a.id as string,
      loja: empresa?.trade_name || empresa?.name || "—",
      plano: plano?.name ?? null,
      situacao: a.status as string,
      periodo: (a.charge_period as string) ?? "monthly",
      mensal: Number(a.monthly_amount ?? 0),
      cobrado: a.charged_amount === null ? null : Number(a.charged_amount),
      venceEm: (a.current_period_end as string | null) ?? null,
      carenciaAte: (a.grace_until as string | null) ?? null,
      ultimoPagamento: (a.last_payment_at as string | null) ?? null,
      desde: (a.started_at as string | null) ?? null,
      ligadaAoMercadoPago: Boolean(a.mp_preapproval_id),
      representante: rep?.name ?? null,
    };
  });

  const ganhos: LinhaComissao[] = (comissoes ?? []).map((e) => {
    const rep = e.partners as unknown as { name?: string } | null;
    const empresa = e.companies as unknown as { name?: string; trade_name?: string } | null;
    return {
      id: e.id as string,
      representante: rep?.name ?? "—",
      loja: empresa?.trade_name || empresa?.name || "—",
      valor: Number(e.amount ?? 0),
      base: (e.basis as string) ?? "",
      ganhoEm: e.earned_at as string,
      pagoEm: (e.paid_at as string | null) ?? null,
    };
  });

  return <PainelCobranca assinaturas={linhas} comissoes={ganhos} />;
}
