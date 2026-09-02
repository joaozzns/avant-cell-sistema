import { getSessionContext } from "@/lib/context";
import { brl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvButton } from "../csv-button";

export default async function StockReportPage() {
  const { supabase, storeId } = await getSessionContext();

  const [{ data: stock }, { data: units }, { data: lastMoves }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("qty, reserved, products(name, avg_cost, cost, sale_price, active)")
      .eq("store_id", storeId)
      .gt("qty", 0),
    supabase
      .from("serialized_units")
      .select("cost, sale_price, status")
      .eq("store_id", storeId)
      .eq("status", "available"),
    supabase
      .from("stock_movements")
      .select("product_id, type, created_at")
      .eq("store_id", storeId)
      .eq("type", "sale_out")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const rows = (stock ?? []).map((s) => {
    const p = s.products as { name?: string; avg_cost?: number; cost?: number; sale_price?: number } | null;
    const cost = Number(p?.avg_cost) || Number(p?.cost) || 0;
    return {
      name: p?.name ?? "—",
      qty: Number(s.qty),
      reserved: Number(s.reserved),
      costValue: Number(s.qty) * cost,
      saleValue: Number(s.qty) * Number(p?.sale_price ?? 0),
    };
  }).sort((a, b) => b.costValue - a.costValue);

  const unitsCost = (units ?? []).reduce((s, u) => s + Number(u.cost), 0);
  const unitsSale = (units ?? []).reduce((s, u) => s + Number(u.sale_price ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + r.costValue, 0) + unitsCost;
  const totalSale = rows.reduce((s, r) => s + r.saleValue, 0) + unitsSale;

  const csvRows = rows.map((r) => ({
    produto: r.name, quantidade: r.qty, reservado: r.reserved,
    valor_custo: r.costValue.toFixed(2), valor_venda: r.saleValue.toFixed(2),
  }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Posição de estoque</h1>
          <p className="text-sm text-muted-foreground">
            Valor a custo: <strong>{brl(totalCost)}</strong> · a preço de venda: {brl(totalSale)}
            {(units ?? []).length > 0 && ` · inclui ${(units ?? []).length} aparelho(s) IMEI disponíveis`}
          </p>
        </div>
        <CsvButton rows={csvRows} filename="posicao-estoque.csv" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dinheiro parado na prateleira (por custo)</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {rows.slice(0, 30).map((r) => (
            <div key={r.name} className="flex justify-between rounded border px-3 py-1.5">
              <span>{r.qty}× {r.name}
                {r.reserved > 0 && <span className="ml-2 text-xs text-muted-foreground">({r.reserved} reservado)</span>}
              </span>
              <span className="font-medium">{brl(r.costValue)}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="text-muted-foreground">Estoque zerado.</p>}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Últimas saídas por venda registradas: {(lastMoves ?? []).length} movimentações ·
        rastreabilidade completa em Estoque → Movimentações
      </p>
    </div>
  );
}
