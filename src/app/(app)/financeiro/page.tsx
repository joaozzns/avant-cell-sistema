import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountForm } from "./account-form";

export default async function FinancePage() {
  const { supabase, storeId } = await getSessionContext();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: accounts }, { data: txs }, { data: recv }, { data: pay }] =
    await Promise.all([
      supabase.from("accounts").select("id, name, type, initial_balance").eq("active", true),
      supabase.from("transactions").select("account_id, kind, amount"),
      supabase.from("receivables").select("amount, interest, fine, discount, paid_amount, due_date")
        .eq("store_id", storeId).in("status", ["open", "partial"]),
      supabase.from("payables").select("amount, paid_amount, due_date")
        .in("status", ["open", "partial"]),
    ]);

  const balances = (accounts ?? []).map((a) => {
    const mov = (txs ?? []).filter((t) => t.account_id === a.id)
      .reduce((s, t) => s + (["in", "transfer_in"].includes(t.kind) ? Number(t.amount) : -Number(t.amount)), 0);
    return { ...a, balance: Number(a.initial_balance) + mov };
  });

  const openRecv = (recv ?? []).reduce((s, r) =>
    s + Number(r.amount) + Number(r.interest) + Number(r.fine) - Number(r.discount) - Number(r.paid_amount), 0);
  const overdueRecv = (recv ?? []).filter((r) => r.due_date < today)
    .reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);
  const openPay = (pay ?? []).reduce((s, p) => s + Number(p.amount) - Number(p.paid_amount), 0);
  const overduePay = (pay ?? []).filter((p) => p.due_date < today)
    .reduce((s, p) => s + Number(p.amount) - Number(p.paid_amount), 0);

  // Fluxo: próximas 4 semanas
  const weeks = [0, 1, 2, 3].map((w) => {
    const start = new Date(); start.setDate(start.getDate() + w * 7);
    const end = new Date(); end.setDate(end.getDate() + (w + 1) * 7);
    const si = start.toISOString().slice(0, 10);
    const ei = end.toISOString().slice(0, 10);
    const rin = (recv ?? []).filter((r) => r.due_date >= si && r.due_date < ei)
      .reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);
    const rout = (pay ?? []).filter((p) => p.due_date >= si && p.due_date < ei)
      .reduce((s, p) => s + Number(p.amount) - Number(p.paid_amount), 0);
    return { label: w === 0 ? "Esta semana" : `+${w} sem.`, in: rin, out: rout };
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
        <div className="flex gap-2">
          <Link href="/financeiro/receber" className={buttonVariants({ variant: "outline" })}>A receber</Link>
          <Link href="/financeiro/pagar" className={buttonVariants({ variant: "outline" })}>A pagar</Link>
          <Link href="/financeiro/dre" className={buttonVariants({})}>DRE</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/financeiro/receber">
          <Card className="transition-colors hover:border-primary">
            <CardHeader className="pb-2">
              <CardDescription>A receber (aberto)</CardDescription>
              <CardTitle className="text-2xl">{brl(openRecv)}</CardTitle>
              {overdueRecv > 0 && (
                <p className="text-xs text-destructive">{brl(overdueRecv)} vencido</p>
              )}
            </CardHeader>
          </Card>
        </Link>
        <Link href="/financeiro/pagar">
          <Card className="transition-colors hover:border-primary">
            <CardHeader className="pb-2">
              <CardDescription>A pagar (aberto)</CardDescription>
              <CardTitle className="text-2xl">{brl(openPay)}</CardTitle>
              {overduePay > 0 && (
                <p className="text-xs text-destructive">{brl(overduePay)} vencido</p>
              )}
            </CardHeader>
          </Card>
        </Link>
        {balances.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardDescription>{a.name} ({a.type === "cash" ? "caixa" : "banco"})</CardDescription>
              <CardTitle className="text-2xl">{brl(a.balance)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fluxo de caixa — próximas 4 semanas</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr><th className="py-1">Período</th><th className="py-1 text-right">Entradas</th>
                  <th className="py-1 text-right">Saídas</th><th className="py-1 text-right">Saldo</th></tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.label} className="border-b last:border-0">
                  <td className="py-1.5">{w.label}</td>
                  <td className="py-1.5 text-right text-green-600">{brl(w.in)}</td>
                  <td className="py-1.5 text-right text-destructive">{brl(w.out)}</td>
                  <td className={`py-1.5 text-right font-medium ${w.in - w.out < 0 ? "text-destructive" : ""}`}>
                    {brl(w.in - w.out)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Baseado nos vencimentos das contas em aberto (crediário, compras e despesas).
          </p>
        </CardContent>
      </Card>

      <AccountForm />
    </div>
  );
}
