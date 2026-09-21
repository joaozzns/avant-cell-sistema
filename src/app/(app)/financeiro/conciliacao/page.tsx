import { getSessionContext } from "@/lib/context";
import { PainelConciliacao, type Lancamento } from "./painel";

export default async function ConciliacaoPage() {
  const { supabase, storeId } = await getSessionContext();

  const [{ data: extrato }, { data: vendas }] = await Promise.all([
    supabase.from("card_settlements")
      .select("id, acquirer, gross, fee, net, expected_date, received_date, status, raw, sale_payment_id")
      .order("expected_date", { ascending: false })
      .limit(300),
    supabase.from("sale_payments")
      .select("id, kind, amount, net_amount, fee_percent, installments, sales!inner(number, store_id, completed_at, status)")
      .in("kind", ["debit", "credit", "credit_installments"])
      .limit(300),
  ]);

  const conciliados = new Set((extrato ?? []).map((e) => e.sale_payment_id).filter(Boolean));

  const lancamentos: Lancamento[] = (extrato ?? []).map((e) => ({
    id: e.id,
    adquirente: e.acquirer,
    bruto: Number(e.gross),
    taxa: Number(e.fee),
    liquido: Number(e.net),
    previsto: e.expected_date,
    situacao: e.status,
    autorizacao: (e.raw as { auth_code?: string } | null)?.auth_code ?? null,
    bandeira: (e.raw as { bandeira?: string } | null)?.bandeira ?? null,
  }));

  const semExtrato = (vendas ?? [])
    .filter((v) => {
      const s = v.sales as unknown as { store_id: string; status: string };
      return !conciliados.has(v.id) && s.store_id === storeId && s.status !== "canceled";
    })
    .map((v) => {
      const s = v.sales as unknown as { number: number; completed_at: string };
      return {
        id: v.id,
        venda: s.number,
        data: s.completed_at,
        valor: Number(v.amount),
        forma: v.kind,
        parcelas: Number(v.installments ?? 1),
      };
    })
    .sort((a, b) => (a.data < b.data ? 1 : -1));

  return <PainelConciliacao lancamentos={lancamentos} semExtrato={semExtrato} />;
}
