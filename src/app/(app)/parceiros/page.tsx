import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { PainelParceiros, type Assinatura, type Representante } from "./painel";

export default async function ParceirosPage() {
  const { supabase, userId } = await getSessionContext();

  /* área do dono do Avant Cell, não da loja: quem não é equipe nem vê a rota */
  const { data: eu } = await supabase
    .from("profiles").select("is_staff").eq("id", userId).maybeSingle();
  if (!eu?.is_staff) redirect("/dashboard");

  const [{ data: reps }, { data: assinaturas }, { data: empresas }, { data: config }] =
    await Promise.all([
      supabase.from("partners")
        .select("id, name, email, phone, token, is_primary, active")
        .order("name"),
      supabase.from("subscriptions")
        .select("company_id, partner_id, monthly_amount, status, started_at, companies(name, trade_name)"),
      supabase.from("companies").select("id, name, trade_name, referred_by, created_at").order("name"),
      supabase.from("partner_settings").select("commission_kind, percent, fixed_amount").maybeSingle(),
    ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origem = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;

  const porRep = new Map<string, { ativas: number; mrr: number; lojas: number }>();
  for (const a of assinaturas ?? []) {
    const id = a.partner_id as string | null;
    if (!id) continue;
    const atual = porRep.get(id) ?? { ativas: 0, mrr: 0, lojas: 0 };
    atual.lojas += 1;
    if (a.status === "active") {
      atual.ativas += 1;
      atual.mrr += Number(a.monthly_amount ?? 0);
    }
    porRep.set(id, atual);
  }

  const representantes: Representante[] = (reps ?? []).map((r) => ({
    id: r.id as string,
    nome: r.name as string,
    email: (r.email as string | null) ?? null,
    telefone: (r.phone as string | null) ?? null,
    principal: Boolean(r.is_primary),
    ativo: Boolean(r.active),
    link: `${origem}/parceiro/${r.token as string}`,
    convite: `${origem}/cadastro?v=${r.token as string}`,
    lojas: porRep.get(r.id as string)?.lojas ?? 0,
    ativas: porRep.get(r.id as string)?.ativas ?? 0,
    mrr: porRep.get(r.id as string)?.mrr ?? 0,
  }));

  const mapaAssinatura = new Map(
    (assinaturas ?? []).map((a) => [a.company_id as string, a]));

  const lojas: Assinatura[] = (empresas ?? []).map((c) => {
    const a = mapaAssinatura.get(c.id as string);
    return {
      empresaId: c.id as string,
      nome: (c.trade_name as string) || (c.name as string),
      representanteId: (a?.partner_id as string | null) ?? (c.referred_by as string | null) ?? null,
      valor: Number(a?.monthly_amount ?? 0),
      situacao: (a?.status as string) ?? "trial",
      desde: (a?.started_at as string | null) ?? (c.created_at as string),
    };
  });

  return (
    <PainelParceiros
      representantes={representantes}
      lojas={lojas}
      modelo={{
        tipo: (config?.commission_kind as string | null) ?? null,
        percentual: config?.percent === null || config?.percent === undefined ? null : Number(config.percent),
        fixo: config?.fixed_amount === null || config?.fixed_amount === undefined ? null : Number(config.fixed_amount),
      }}
    />
  );
}
