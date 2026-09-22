import { getSessionContext } from "@/lib/context";
import { brl, isoLocal } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const { supabase, storeId } = await getSessionContext();

  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : isoLocal().slice(0, 7);
  const start = `${month}-01`;
  const endDate = new Date(`${month}-01T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = isoLocal(endDate);

  const [{ data: sales }, { data: deliveredOs }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, total, source, sale_items(qty, unit_cost, total, products(type))")
      .eq("store_id", storeId)
      .eq("status", "completed")
      .gte("completed_at", start)
      .lt("completed_at", end),
    supabase
      .from("service_orders")
      .select("cost_parts, cost_labor, cost_external")
      .eq("store_id", storeId)
      .eq("status", "delivered")
      .gte("delivered_at", start)
      .lt("delivered_at", end),
  ]);

  const { data: otherExpenses } = await supabase
    .from("payables")
    .select("amount, finance_categories(name)")
    .gte("due_date", start)
    .lt("due_date", end)
    .is("entry_id", null)
    .is("po_id", null);

  let revenueProducts = 0, revenueServices = 0, cmv = 0;
  for (const s of sales ?? []) {
    for (const i of s.sale_items as { qty: number; unit_cost: number; total: number; products: { type?: string } | null }[]) {
      const isService = i.products?.type === "service";
      if (isService) revenueServices += Number(i.total);
      else { revenueProducts += Number(i.total); cmv += Number(i.qty) * Number(i.unit_cost); }
    }
  }
  const osCosts = (deliveredOs ?? []).reduce((s, o) =>
    s + Number(o.cost_parts) + Number(o.cost_labor) + Number(o.cost_external), 0);

  const expByCat = new Map<string, number>();
  for (const e of otherExpenses ?? []) {
    const cat = (e.finance_categories as { name?: string } | null)?.name ?? "Sem categoria";
    expByCat.set(cat, (expByCat.get(cat) ?? 0) + Number(e.amount));
  }
  const totalExpenses = [...expByCat.values()].reduce((s, v) => s + v, 0);

  const grossRevenue = revenueProducts + revenueServices;
  const grossProfit = grossRevenue - cmv - osCosts;
  const netProfit = grossProfit - totalExpenses;

  const Row = ({ label, value, bold, negative, indent }: {
    label: string; value: number; bold?: boolean; negative?: boolean; indent?: boolean;
  }) => (
    <div className={`flex justify-between py-1.5 ${bold ? "border-t font-bold" : ""} ${indent ? "pl-4 text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className={negative && value !== 0 ? "text-destructive" : ""}>
        {negative && value > 0 ? "−" : ""}{brl(Math.abs(value))}
      </span>
    </div>
  );

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">DRE gerencial</h1>
        <form>
          <input type="month" name="m" defaultValue={month}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            onChange={undefined} />
          <button type="submit" className="ml-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            Ver
          </button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Resultado de {month.split("-").reverse().join("/")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <Row label="Receita — venda de produtos" value={revenueProducts} />
          <Row label="Receita — serviços de assistência" value={revenueServices} />
          <Row label="Receita bruta" value={grossRevenue} bold />
          <Row label="CMV (custo médio das mercadorias)" value={cmv} negative />
          <Row label="Custo das OS (peças + terceiros)" value={osCosts} negative />
          <Row label="Lucro bruto" value={grossProfit} bold />
          {[...expByCat.entries()].map(([cat, v]) => (
            <Row key={cat} label={cat} value={v} negative indent />
          ))}
          <Row label="Despesas operacionais" value={totalExpenses} negative />
          <Row label="Lucro líquido" value={netProfit} bold />
          {grossRevenue > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Margem líquida: {((netProfit / grossRevenue) * 100).toFixed(1)}% ·
              CMV pelo custo médio congelado no momento de cada venda
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
