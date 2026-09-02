import { getSessionContext } from "@/lib/context";
import { brl, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PayableForm } from "./payable-form";
import { SettlePayableButton } from "../settle-widgets";

export default async function PayablesPage() {
  const { supabase } = await getSessionContext();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: rows }, { data: accounts }, { data: categories }, { data: costCenters }] =
    await Promise.all([
      supabase
        .from("payables")
        .select("id, description, due_date, amount, paid_amount, status, suppliers(name), finance_categories(name)")
        .in("status", ["open", "partial"])
        .order("due_date")
        .limit(200),
      supabase.from("accounts").select("id, name").eq("active", true),
      supabase.from("finance_categories").select("id, name").eq("kind", "expense").eq("active", true),
      supabase.from("cost_centers").select("id, name").eq("active", true),
    ]);

  const total = (rows ?? []).reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contas a pagar</h1>
        <p className="text-sm text-muted-foreground">
          {(rows ?? []).length} em aberto · {brl(total)}
        </p>
      </div>

      <PayableForm categories={categories ?? []} costCenters={costCenters ?? []} />

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Fornecedor / categoria</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r) => {
              const balance = Number(r.amount) - Number(r.paid_amount);
              const overdue = r.due_date < today;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.description}
                    {r.status === "partial" && <Badge variant="outline" className="ml-2">parcial</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(r.suppliers as { name?: string } | null)?.name
                      ?? (r.finance_categories as { name?: string } | null)?.name ?? "—"}
                  </TableCell>
                  <TableCell className={overdue ? "font-semibold text-destructive" : "text-muted-foreground"}>
                    {fmtDate(r.due_date)}{overdue && " ⚠"}
                  </TableCell>
                  <TableCell className="text-right font-medium">{brl(balance)}</TableCell>
                  <TableCell className="text-right">
                    <SettlePayableButton
                      id={r.id} description={r.description}
                      balance={balance} accounts={accounts ?? []} />
                  </TableCell>
                </TableRow>
              );
            })}
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nada em aberto. Recebimentos de compra geram contas aqui automaticamente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
