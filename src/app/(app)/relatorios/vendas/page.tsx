import { getSessionContext } from "@/lib/context";
import { brl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodFilter, getPeriod } from "../period-filter";
import { CsvButton } from "../csv-button";
import { rotuloPagamento } from "@/lib/pagamentos";

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sp = await searchParams;
  const { de, ate, deIso, ateIso } = getPeriod(sp);
  const { supabase, storeId } = await getSessionContext();

  const { data: sales } = await supabase
    .from("sales")
    .select("id, total, discount, completed_at, profiles:seller_id(full_name), sale_payments(kind, amount, change_given), sale_items(qty, total, unit_cost, products(name, type))")
    .eq("store_id", storeId)
    .eq("status", "completed")
    .gte("completed_at", deIso)
    .lt("completed_at", ateIso);

  const rows = sales ?? [];
  const total = rows.reduce((s, v) => s + Number(v.total), 0);
  const ticket = rows.length > 0 ? total / rows.length : 0;

  // por dia
  const byDay = new Map<string, { total: number; count: number }>();
  // por forma
  const byKind = new Map<string, number>();
  // por vendedor
  const bySeller = new Map<string, { total: number; count: number }>();
  // ranking produtos
  const byProduct = new Map<string, { qty: number; total: number; cost: number }>();

  for (const s of rows) {
    const day = String(s.completed_at).slice(0, 10);
    const d = byDay.get(day) ?? { total: 0, count: 0 };
    d.total += Number(s.total); d.count += 1;
    byDay.set(day, d);

    const seller = (s.profiles as { full_name?: string } | null)?.full_name ?? "Balcão";
    const sv = bySeller.get(seller) ?? { total: 0, count: 0 };
    sv.total += Number(s.total); sv.count += 1;
    bySeller.set(seller, sv);

    for (const p of s.sale_payments as { kind: string; amount: number; change_given: number }[]) {
      byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + Number(p.amount) - Number(p.change_given ?? 0));
    }
    for (const i of s.sale_items as { qty: number; total: number; unit_cost: number; products: { name?: string } | null }[]) {
      const name = i.products?.name ?? "—";
      const pr = byProduct.get(name) ?? { qty: 0, total: 0, cost: 0 };
      pr.qty += Number(i.qty); pr.total += Number(i.total);
      pr.cost += Number(i.qty) * Number(i.unit_cost);
      byProduct.set(name, pr);
    }
  }

  const productRanking = [...byProduct.entries()]
    .sort((a, b) => b[1].total - a[1].total).slice(0, 15);

  const csvRows = [...byDay.entries()].sort().map(([day, d]) => ({
    dia: day.split("-").reverse().join("/"), vendas: d.count, faturamento: d.total.toFixed(2),
  }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatório de vendas</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} vendas · {brl(total)} · ticket médio {brl(ticket)}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <PeriodFilter de={de} ate={ate} />
          <CsvButton rows={csvRows} filename={`vendas-${de}-a-${ate}.csv`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Por dia</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {[...byDay.entries()].sort().map(([day, d]) => (
              <div key={day} className="flex justify-between rounded border px-3 py-1.5">
                <span>{day.split("-").reverse().join("/")} · {d.count} vendas</span>
                <span className="font-medium">{brl(d.total)}</span>
              </div>
            ))}
            {byDay.size === 0 && <p className="text-muted-foreground">Sem vendas no período.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por forma de pagamento</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([kind, v]) => (
              <div key={kind} className="flex justify-between rounded border px-3 py-1.5">
                <span>{rotuloPagamento(kind)}</span>
                <span className="font-medium">{brl(v)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ranking de produtos</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {productRanking.map(([name, p]) => (
              <div key={name} className="flex justify-between rounded border px-3 py-1.5">
                <span>{p.qty}× {name}</span>
                <span className="font-medium">
                  {brl(p.total)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    margem {p.total > 0 ? Math.round(((p.total - p.cost) / p.total) * 100) : 0}%
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por vendedor</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {[...bySeller.entries()].sort((a, b) => b[1].total - a[1].total).map(([name, v]) => (
              <div key={name} className="flex justify-between rounded border px-3 py-1.5">
                <span>{name} · {v.count} vendas</span>
                <span className="font-medium">{brl(v.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
