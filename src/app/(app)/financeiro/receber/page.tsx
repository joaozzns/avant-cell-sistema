import { getSessionContext } from "@/lib/context";
import { brl, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SettleReceivableButton } from "../settle-widgets";

export default async function ReceivablesPage() {
  const { supabase, storeId } = await getSessionContext();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: rows }, { data: accounts }] = await Promise.all([
    supabase
      .from("receivables")
      .select("id, description, due_date, amount, interest, fine, discount, paid_amount, status, customers(name)")
      .eq("store_id", storeId)
      .in("status", ["open", "partial"])
      .order("due_date")
      .limit(200),
    supabase.from("accounts").select("id, name").eq("active", true).neq("type", "cash"),
  ]);

  const total = (rows ?? []).reduce((s, r) =>
    s + Number(r.amount) + Number(r.interest) + Number(r.fine) - Number(r.discount) - Number(r.paid_amount), 0);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contas a receber</h1>
        <p className="text-sm text-muted-foreground">
          {(rows ?? []).length} parcelas em aberto · {brl(total)}
        </p>
      </div>
      <div className="min-w-0 rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r) => {
              const balance = Number(r.amount) + Number(r.interest) + Number(r.fine)
                - Number(r.discount) - Number(r.paid_amount);
              const overdue = r.due_date < today;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.description}
                    {r.status === "partial" && <Badge variant="outline" className="ml-2">parcial</Badge>}
                  </TableCell>
                  <TableCell>{(r.customers as { name?: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell className={overdue ? "font-semibold text-destructive" : "text-muted-foreground"}>
                    {fmtDate(r.due_date)}{overdue && " ⚠"}
                  </TableCell>
                  <TableCell className="text-right font-medium">{brl(balance)}</TableCell>
                  <TableCell className="text-right">
                    <SettleReceivableButton
                      id={r.id} description={r.description}
                      balance={balance} accounts={accounts ?? []} />
                  </TableCell>
                </TableRow>
              );
            })}
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nada em aberto. Vendas no crediário geram parcelas aqui automaticamente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
