import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceiveForm } from "./receive-form";

export default async function PoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getSessionContext();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name), purchase_order_items(id, qty, qty_received, unit_cost, products(name))")
    .eq("id", id)
    .maybeSingle();
  if (!po) notFound();

  const items = (po.purchase_order_items ?? []) as {
    id: string; qty: number; qty_received: number; unit_cost: number;
    products: { name: string } | null;
  }[];
  const open = ["draft", "sent", "confirmed", "partial"].includes(po.status);

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Pedido #{po.number}</h1>
        <Badge variant={po.status === "received" ? "default" : "secondary"}>
          {po.status === "received" ? "recebido" : po.status === "partial" ? "parcial" : po.status}
        </Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dados</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p><span className="text-muted-foreground">Fornecedor:</span> {(po.suppliers as { name?: string } | null)?.name}</p>
          <p><span className="text-muted-foreground">Criado:</span> {fmtDate(po.created_at)}
            {po.expected_at && <> · <span className="text-muted-foreground">previsão:</span> {fmtDate(po.expected_at)}</>}</p>
          <p><span className="text-muted-foreground">Total:</span> <strong>{brl(po.total)}</strong></p>
          {po.notes && <p><span className="text-muted-foreground">Obs.:</span> {po.notes}</p>}
        </CardContent>
      </Card>

      {open ? (
        <ReceiveForm poId={po.id} items={items} />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-1.5">{i.products?.name}</td>
                    <td className="py-1.5 text-center text-muted-foreground">
                      {Number(i.qty_received)}/{Number(i.qty)}
                    </td>
                    <td className="py-1.5 text-right">{brl(Number(i.qty) * Number(i.unit_cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
