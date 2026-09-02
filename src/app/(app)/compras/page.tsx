import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDate } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const PO_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:     { label: "Rascunho",   variant: "outline" },
  sent:      { label: "Enviado",    variant: "secondary" },
  confirmed: { label: "Confirmado", variant: "secondary" },
  partial:   { label: "Parcial",    variant: "default" },
  received:  { label: "Recebido",   variant: "default" },
  canceled:  { label: "Cancelado",  variant: "destructive" },
};

export default async function PurchasesPage() {
  const { supabase, storeId } = await getSessionContext();

  const [{ data: pos }, { data: lowStock }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, number, status, total, expected_at, created_at, suppliers(name)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("stock_items")
      .select("qty, min_qty, products(id, name, cost)")
      .eq("store_id", storeId)
      .gt("min_qty", 0),
  ]);

  const suggestions = (lowStock ?? []).filter((s) => Number(s.qty) <= Number(s.min_qty));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">{(pos ?? []).length} pedidos</p>
        </div>
        <div className="flex gap-2">
          <Link href="/compras/fornecedores" className={buttonVariants({ variant: "outline" })}>
            Fornecedores
          </Link>
          <Link href="/compras/novo" className={buttonVariants({})}>
            Novo pedido
          </Link>
        </div>
      </div>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-amber-600">
              Sugestão de reposição — {suggestions.length} itens no mínimo ou abaixo
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {suggestions.slice(0, 10).map((s, i) => {
              const p = s.products as { name?: string } | null;
              return (
                <div key={i} className="flex justify-between rounded border px-3 py-1.5">
                  <span>{p?.name}</span>
                  <span className="text-muted-foreground">
                    {Number(s.qty)} em estoque · mín. {Number(s.min_qty)}
                  </span>
                </div>
              );
            })}
            <Link href="/compras/novo" className="mt-1 text-sm underline underline-offset-4">
              Gerar pedido de compra →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Criado</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(pos ?? []).map((po) => {
              const st = PO_STATUS[po.status] ?? { label: po.status, variant: "outline" as const };
              return (
                <TableRow key={po.id}>
                  <TableCell>
                    <Link href={`/compras/${po.id}`} className="font-medium hover:underline">
                      #{po.number}
                    </Link>
                  </TableCell>
                  <TableCell>{(po.suppliers as { name?: string } | null)?.name}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(po.created_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(po.expected_at)}</TableCell>
                  <TableCell className="text-right font-medium">{brl(po.total)}</TableCell>
                  <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                </TableRow>
              );
            })}
            {(pos ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum pedido. <Link href="/compras/novo" className="underline">Criar o primeiro</Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
