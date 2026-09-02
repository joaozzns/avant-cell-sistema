import { getSessionContext } from "@/lib/context";
import { brl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodFilter, getPeriod } from "../period-filter";
import { CsvButton } from "../csv-button";
import { OS_STATUS } from "@/app/(app)/os/os-labels";

export default async function OsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sp = await searchParams;
  const { de, ate, deIso, ateIso } = getPeriod(sp);
  const { supabase, storeId } = await getSessionContext();

  const { data: orders } = await supabase
    .from("service_orders")
    .select("id, status, total, cost_parts, cost_labor, cost_external, created_at, delivered_at, original_os_id, profiles:technician_id(full_name)")
    .eq("store_id", storeId)
    .gte("created_at", deIso)
    .lt("created_at", ateIso);

  const rows = orders ?? [];
  const delivered = rows.filter((o) => o.status === "delivered");
  const revenue = delivered.reduce((s, o) => s + Number(o.total), 0);
  const costs = delivered.reduce((s, o) =>
    s + Number(o.cost_parts) + Number(o.cost_labor) + Number(o.cost_external), 0);
  const returns = rows.filter((o) => o.original_os_id).length;

  const avgDays = delivered.length > 0
    ? delivered.reduce((s, o) =>
        s + (new Date(o.delivered_at!).getTime() - new Date(o.created_at).getTime()) / 86400000, 0)
      / delivered.length
    : 0;

  const byStatus = new Map<string, number>();
  const byTech = new Map<string, { count: number; revenue: number }>();
  for (const o of rows) {
    byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
    if (o.status === "delivered") {
      const tech = (o.profiles as { full_name?: string } | null)?.full_name ?? "Sem técnico";
      const t = byTech.get(tech) ?? { count: 0, revenue: 0 };
      t.count += 1; t.revenue += Number(o.total);
      byTech.set(tech, t);
    }
  }

  const csvRows = rows.map((o) => ({
    status: OS_STATUS[o.status]?.label ?? o.status,
    tecnico: (o.profiles as { full_name?: string } | null)?.full_name ?? "",
    total: Number(o.total).toFixed(2),
    custo: (Number(o.cost_parts) + Number(o.cost_labor) + Number(o.cost_external)).toFixed(2),
    abertura: String(o.created_at).slice(0, 10),
    entrega: o.delivered_at ? String(o.delivered_at).slice(0, 10) : "",
  }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatório da assistência</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} OS abertas no período · {delivered.length} entregues ·
            receita {brl(revenue)} · margem {brl(revenue - costs)}
            {returns > 0 && <span className="text-destructive"> · {returns} retorno(s) de garantia</span>}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <PeriodFilter de={de} ate={ate} />
          <CsvButton rows={csvRows} filename={`os-${de}-a-${ate}.csv`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Volume por status</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {[...byStatus.entries()].map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 rounded border px-3 py-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${OS_STATUS[status]?.color ?? "bg-gray-400"}`} />
                <span>{OS_STATUS[status]?.label ?? status}</span>
                <span className="ml-auto font-medium">{count}</span>
              </div>
            ))}
            {byStatus.size === 0 && <p className="text-muted-foreground">Sem OS no período.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Produtividade por técnico</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {[...byTech.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([name, t]) => (
              <div key={name} className="flex justify-between rounded border px-3 py-1.5">
                <span>{name} · {t.count} OS entregues</span>
                <span className="font-medium">{brl(t.revenue)}</span>
              </div>
            ))}
            {byTech.size === 0 && <p className="text-muted-foreground">Nenhuma entrega no período.</p>}
            {avgDays > 0 && (
              <p className="pt-2 text-xs text-muted-foreground">
                Tempo médio de reparo (abertura → entrega): {avgDays.toFixed(1)} dias
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
