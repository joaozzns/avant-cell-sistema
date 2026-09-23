import { getSessionContext } from "@/lib/context";
import { FormasDePagamento, type Forma } from "./editor";

export default async function FormasPage() {
  const { supabase, companyId } = await getSessionContext();

  const [{ data: formas }, { data: vendas }] = await Promise.all([
    supabase
      .from("payment_methods")
      .select("id, kind, name, fee_percent, days_to_receive, installments, active")
      .eq("company_id", companyId)
      .order("name"),
    /* quanto já foi vendido em cada forma sem taxa cadastrada: é o tamanho do
       que está passando sem conferência */
    supabase
      .from("sale_payments")
      .select("kind, amount, fee_percent")
      .in("kind", ["debit", "credit", "credit_installments"])
      .limit(500),
  ]);

  const semTaxa = (vendas ?? [])
    .filter((v) => Number(v.fee_percent ?? 0) === 0)
    .reduce((s, v) => s + Number(v.amount), 0);

  const lista: Forma[] = (formas ?? []).map((f) => ({
    id: f.id as string,
    tipo: f.kind as string,
    nome: f.name as string,
    taxa: Number(f.fee_percent ?? 0),
    dias: Number(f.days_to_receive ?? 0),
    parcelas: ((f.installments ?? []) as { n: number; fee_percent: number; days: number }[]) ?? [],
    ativa: Boolean(f.active),
  }));

  return <FormasDePagamento formas={lista} vendidoSemTaxa={semTaxa} />;
}
