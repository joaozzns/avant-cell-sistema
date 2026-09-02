import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl } from "@/lib/format";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const { supabase, storeId, storeName } = await getSessionContext();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7days = new Date();
  in7days.setDate(in7days.getDate() + 7);

  const [{ data: todaySales }, { count: openOs }, { data: receivables }, { data: lowStock }] =
    await Promise.all([
      supabase
        .from("sales")
        .select("total")
        .eq("store_id", storeId)
        .eq("status", "completed")
        .gte("created_at", today.toISOString()),
      supabase
        .from("service_orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .not("status", "in", "(delivered,canceled)"),
      supabase
        .from("receivables")
        .select("amount, paid_amount")
        .eq("store_id", storeId)
        .in("status", ["open", "partial"])
        .lte("due_date", in7days.toISOString().slice(0, 10)),
      supabase
        .from("stock_items")
        .select("qty, min_qty, products(name)")
        .eq("store_id", storeId)
        .gt("min_qty", 0),
    ]);

  const revenue = (todaySales ?? []).reduce((s, v) => s + Number(v.total), 0);
  const toReceive = (receivables ?? []).reduce(
    (s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);
  const lowItems = (lowStock ?? []).filter((s) => Number(s.qty) <= Number(s.min_qty));

  const kpis = [
    { label: "Faturamento do dia", value: brl(revenue), href: "/pdv/vendas" },
    { label: "Vendas hoje", value: String((todaySales ?? []).length), href: "/pdv/vendas" },
    { label: "OS abertas", value: String(openOs ?? 0), href: "/os" },
    { label: "A receber (7 dias)", value: brl(toReceive), href: "/financeiro" },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Loja: {storeName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader className="pb-2">
                <CardDescription>{kpi.label}</CardDescription>
                <CardTitle className="text-2xl">{kpi.value}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {lowItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Estoque abaixo do mínimo ({lowItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {lowItems.slice(0, 8).map((s, i) => (
              <div key={i} className="flex justify-between rounded border px-3 py-1.5">
                <span>{(s.products as { name?: string } | null)?.name}</span>
                <span className="text-destructive">{Number(s.qty)} / mín. {Number(s.min_qty)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atalhos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Link href="/pdv" className="rounded-md border px-3 py-1.5 hover:bg-muted">Nova venda</Link>
          <Link href="/clientes/novo" className="rounded-md border px-3 py-1.5 hover:bg-muted">Novo cliente</Link>
          <Link href="/estoque/novo" className="rounded-md border px-3 py-1.5 hover:bg-muted">Novo produto</Link>
          <Link href="/estoque/aparelhos" className="rounded-md border px-3 py-1.5 hover:bg-muted">Entrada de aparelho</Link>
          <Link href="/pdv/caixa" className="rounded-md border px-3 py-1.5 hover:bg-muted">Caixa</Link>
        </CardContent>
      </Card>
    </div>
  );
}
