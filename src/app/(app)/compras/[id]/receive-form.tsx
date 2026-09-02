"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receivePo } from "../actions";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PoItem = {
  id: string; qty: number; qty_received: number; unit_cost: number;
  products: { name: string } | null;
};

export function ReceiveForm({ poId, items }: { poId: string; items: PoItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const [invoice, setInvoice] = useState("");
  const [freight, setFreight] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [received, setReceived] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, String(Number(i.qty) - Number(i.qty_received))]))
  );
  const [costs, setCosts] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, String(i.unit_cost)]))
  );

  function submit() {
    setError("");
    startTransition(async () => {
      const r = await receivePo({
        poId,
        invoiceNumber: invoice || undefined,
        freight: Number(freight.replace(",", ".")) || 0,
        dueDate: dueDate || undefined,
        items: items.map((i) => ({
          itemId: i.id,
          qtyReceived: Number(received[i.id]) || 0,
          unitCost: Number(costs[i.id]?.replace(",", ".")) || undefined,
        })).filter((i) => i.qtyReceived > 0),
      });
      if (r.error) { setError(r.error); return; }
      setDone(r.total ?? 0);
      router.refresh();
    });
  }

  if (done !== null) {
    return (
      <Card>
        <CardContent className="grid gap-2 pt-6 text-sm">
          <p className="font-medium text-green-600">Recebimento concluído ✓</p>
          <p className="text-muted-foreground">
            Estoque atualizado, custo médio recalculado e conta a pagar de {brl(done)} gerada.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Conferência e recebimento</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Nº da nota fiscal" />
          <Input value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="Frete (R$)" inputMode="decimal" />
          <div className="grid gap-1">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <span className="text-xs text-muted-foreground">Vencimento (padrão +30 dias)</span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr><th className="py-1">Item</th><th className="py-1 text-center">Pedido</th>
                <th className="py-1 text-center">Já recebido</th>
                <th className="py-1 text-center">Recebendo</th>
                <th className="py-1 text-right">Custo un.</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="py-1.5">{i.products?.name}</td>
                <td className="py-1.5 text-center text-muted-foreground">{Number(i.qty)}</td>
                <td className="py-1.5 text-center text-muted-foreground">{Number(i.qty_received)}</td>
                <td className="py-1.5 text-center">
                  <input inputMode="decimal" value={received[i.id]}
                    onChange={(e) => setReceived((p) => ({ ...p, [i.id]: e.target.value }))}
                    className="w-20 rounded border bg-transparent px-1 py-0.5 text-center" />
                </td>
                <td className="py-1.5 text-right">
                  <input inputMode="decimal" value={costs[i.id]}
                    onChange={(e) => setCosts((p) => ({ ...p, [i.id]: e.target.value }))}
                    className="w-24 rounded border bg-transparent px-1 py-0.5 text-right" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={submit} disabled={pending}>
          {pending ? "Processando…" : "Confirmar recebimento"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Gera a entrada de estoque, recalcula o custo médio e lança a conta a pagar automaticamente.
        </p>
      </CardContent>
    </Card>
  );
}
