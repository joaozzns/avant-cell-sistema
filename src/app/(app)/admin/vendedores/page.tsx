import { headers } from "next/headers";
import { getSessionContext } from "@/lib/context";
import { isoLocal } from "@/lib/format";
import { ListaVendedores, type Vendedor } from "./lista";

export default async function VendedoresPage() {
  const { supabase, companyId } = await getSessionContext();

  const mes = isoLocal().slice(0, 7);
  const inicio = `${mes}-01`;
  const fim = isoLocal(new Date(new Date(`${inicio}T00:00:00`).setMonth(new Date(`${inicio}T00:00:00`).getMonth() + 1)));

  const [{ data: equipe }, { data: vendas }, { data: comissoes }, { data: metas }] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, email, active, primary_seller, seller_token")
      .eq("company_id", companyId).eq("active", true).order("full_name"),
    supabase.from("sales")
      .select("seller_id, total")
      .in("status", ["completed", "partially_returned"])
      .gte("completed_at", inicio).lt("completed_at", fim),
    supabase.from("commission_entries")
      .select("user_id, amount").eq("period", mes),
    supabase.from("goals").select("user_id, target").eq("period", mes),
  ]);

  const soma = (linhas: { [k: string]: unknown }[], chave: string, campo: string) => {
    const m = new Map<string, number>();
    for (const l of linhas ?? []) {
      const id = l[chave] as string | null;
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + Number(l[campo] ?? 0));
    }
    return m;
  };

  const vendaPorPessoa = soma(vendas ?? [], "seller_id", "total");
  const comissaoPorPessoa = soma(comissoes ?? [], "user_id", "amount");
  const metaPorPessoa = soma(metas ?? [], "user_id", "target");
  const qtdPorPessoa = new Map<string, number>();
  for (const v of vendas ?? []) {
    if (!v.seller_id) continue;
    qtdPorPessoa.set(v.seller_id, (qtdPorPessoa.get(v.seller_id) ?? 0) + 1);
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origem = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;

  const lista: Vendedor[] = (equipe ?? []).map((p) => ({
    id: p.id as string,
    nome: (p.full_name as string) ?? "—",
    email: (p.email as string) ?? "",
    principal: Boolean(p.primary_seller),
    link: `${origem}/vendedor/${p.seller_token as string}`,
    vendeu: vendaPorPessoa.get(p.id as string) ?? 0,
    vendas: qtdPorPessoa.get(p.id as string) ?? 0,
    comissao: comissaoPorPessoa.get(p.id as string) ?? 0,
    meta: metaPorPessoa.get(p.id as string) ?? 0,
  }));

  return <ListaVendedores vendedores={lista} periodo={mes} />;
}
