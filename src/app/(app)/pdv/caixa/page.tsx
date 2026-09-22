import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpenCashForm, CloseCashForm, CashMoveForm } from "./cash-forms";
import { rotuloPagamento } from "@/lib/pagamentos";

const MOVE_LABEL: Record<string, string> = {
  sale: "Venda",
  withdrawal: "Sangria",
  supply: "Suprimento",
  receivable_payment: "Recebimento",
  refund: "Estorno",
  opening: "Abertura",
};

/* estorno e sangria tiram dinheiro da gaveta; o resto põe */
const SAI_DO_CAIXA = new Set(["withdrawal", "refund"]);

export default async function CashPage() {
  const { supabase, storeId, userId } = await getSessionContext();

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id, opening_amount, opened_at")
    .eq("store_id", storeId)
    .eq("opened_by", userId)
    .eq("status", "open")
    .maybeSingle();

  if (!session) {
    const { data: lastClosed } = await supabase
      .from("cash_sessions")
      .select("opened_at, closed_at, opening_amount, expected, counted, difference")
      .eq("store_id", storeId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (
      <div className="grid gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Caixa</h1>
        <Card>
          <CardHeader>
            <CardTitle>Abertura de caixa</CardTitle>
            <CardDescription>
              Um caixa por operador e por unidade. Toda venda fica vinculada a este turno.
            </CardDescription>
          </CardHeader>
          <CardContent><OpenCashForm /></CardContent>
        </Card>
        {lastClosed && (
          <Card>
            <CardHeader><CardTitle className="text-base">Último fechamento</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>Aberto: {fmtDateTime(lastClosed.opened_at)} · Fechado: {fmtDateTime(lastClosed.closed_at)}</p>
              <p>
                Esperado em dinheiro: {brl((lastClosed.expected as { cash?: number } | null)?.cash)} ·
                Contado: {brl((lastClosed.counted as { cash?: number } | null)?.cash)} ·
                Diferença:{" "}
                <span className={Number(lastClosed.difference) !== 0 ? "font-semibold text-destructive" : "text-green-600"}>
                  {brl(lastClosed.difference)}
                </span>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const { data: moves } = await supabase
    .from("cash_movements")
    .select("id, type, amount, reason, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false });

  const { data: sales } = await supabase
    .from("sales")
    .select("total, sale_payments(kind, amount, change_given)")
    .eq("cash_session_id", session.id)
    .eq("status", "completed");

  const byKind: Record<string, number> = {};
  for (const s of sales ?? []) {
    for (const p of s.sale_payments as { kind: string; amount: number; change_given: number }[]) {
      byKind[p.kind] = (byKind[p.kind] ?? 0) + Number(p.amount) - Number(p.change_given ?? 0);
    }
  }
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Caixa</h1>
        <Badge>aberto desde {fmtDateTime(session.opened_at)}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fundo de troco</CardDescription>
            <CardTitle className="text-xl">{brl(session.opening_amount)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vendas do turno</CardDescription>
            <CardTitle className="text-xl">{(sales ?? []).length}</CardTitle>
          </CardHeader>
        </Card>
        {Object.entries(byKind).map(([kind, value]) => (
          <Card key={kind}>
            <CardHeader className="pb-2">
              <CardDescription>{rotuloPagamento(kind)}</CardDescription>
              <CardTitle className="text-xl">{brl(value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sangria e suprimento</CardTitle>
        </CardHeader>
        <CardContent><CashMoveForm /></CardContent>
      </Card>

      {(moves ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Movimentações do turno</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {(moves ?? []).map((m) => (
              <div key={m.id} className="flex justify-between rounded border px-3 py-1.5">
                <span>
                  {MOVE_LABEL[m.type] ?? m.type}
                  {m.reason && <span className="ml-2 text-muted-foreground">{m.reason}</span>}
                </span>
                <span className={SAI_DO_CAIXA.has(m.type) ? "text-destructive" : ""}>
                  {SAI_DO_CAIXA.has(m.type) ? "−" : "+"}{brl(m.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fechamento</CardTitle>
        </CardHeader>
        <CardContent><CloseCashForm sessionId={session.id} /></CardContent>
      </Card>
    </div>
  );
}
