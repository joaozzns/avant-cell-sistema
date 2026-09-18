import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function SalesPage() {
  const { supabase, storeId } = await getSessionContext();
  const { data: sales } = await supabase
    .from("sales")
    .select("id, number, status, total, discount, created_at, customers(name), profiles:seller_id(full_name), sale_items(id)")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(100);

  const totalDay = (sales ?? [])
    .filter((s) => s.status === "completed" &&
      new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + Number(s.total), 0);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
        <p className="text-sm text-muted-foreground">
          Hoje: {brl(totalDay)} · últimas 100 vendas da loja
        </p>
      </div>
      <div className="min-w-0 rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-center">Itens</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sales ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/pdv/vendas/${s.id}`} className="font-medium hover:underline">
                    #{s.number}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDateTime(s.created_at)}</TableCell>
                <TableCell>{(s.customers as { name?: string } | null)?.name ?? "Balcão"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(s.profiles as { full_name?: string } | null)?.full_name ?? "—"}
                </TableCell>
                <TableCell className="text-center">{(s.sale_items as unknown[]).length}</TableCell>
                <TableCell className="text-right font-medium">{brl(s.total)}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "completed" ? "default" : "destructive"}>
                    {s.status === "completed" ? "concluída" : s.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(sales ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhuma venda ainda. <Link href="/pdv" className="underline">Abrir o PDV</Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
