import { getSessionContext } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const MOVE_LABEL: Record<string, string> = {
  purchase_in: "Entrada (compra)",
  sale_out: "Venda",
  sale_return_in: "Devolução de venda",
  os_use: "Uso em OS",
  os_return_in: "Retorno de OS",
  transfer_out: "Transferência (saída)",
  transfer_in: "Transferência (entrada)",
  adjustment_in: "Ajuste (entrada)",
  adjustment_out: "Ajuste (saída)",
  loss: "Perda",
  breakage: "Quebra",
  theft: "Roubo/furto",
  internal_use: "Uso interno",
  demo: "Demonstração",
  gift: "Brinde",
  cannibalization: "Canibalização",
  supplier_warranty_out: "Garantia fornecedor",
  trade_in: "Trade-in",
};

export default async function MovementsPage() {
  const { supabase, storeId } = await getSessionContext();
  const { data: moves } = await supabase
    .from("stock_movements")
    .select("id, type, qty, reason, created_at, products(name), profiles:user_id(full_name)")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Movimentações de estoque</h1>
        <p className="text-sm text-muted-foreground">
          Últimas 100 da loja ativa — toda mudança de quantidade tem origem registrada.
        </p>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(moves ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">{fmtDateTime(m.created_at)}</TableCell>
                <TableCell>{(m.products as { name?: string } | null)?.name}</TableCell>
                <TableCell>{MOVE_LABEL[m.type] ?? m.type}</TableCell>
                <TableCell className={`text-right font-medium ${Number(m.qty) < 0 ? "text-destructive" : "text-green-600"}`}>
                  {Number(m.qty) > 0 ? `+${m.qty}` : m.qty}
                </TableCell>
                <TableCell className="text-muted-foreground">{m.reason ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(m.profiles as { full_name?: string } | null)?.full_name ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {(moves ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhuma movimentação ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
