"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseOrder, searchPoProducts } from "../actions";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Item = { productId: string; name: string; qty: number; unitCost: number };
type Result = { id: string; name: string; cost: number; stock: number; min: number };

export function PoForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => {
      startTransition(async () => setResults(await searchPoProducts(term)));
    }, 250);
    return () => clearTimeout(h);
  }, [term]);

  const total = items.reduce((s, i) => s + i.qty * i.unitCost, 0);

  function submit() {
    setError("");
    startTransition(async () => {
      const r = await createPurchaseOrder({
        supplierId, expectedAt: expectedAt || null, notes, items,
      });
      if (r.error) { setError(r.error); return; }
      router.push(`/compras/${r.poId}`);
    });
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Dados do pedido</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm">
            <option value="">Fornecedor *</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="relative">
            <Input value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar produto para adicionar…" />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg">
                {results.map((r) => (
                  <button key={r.id}
                    onClick={() => {
                      setItems((prev) => prev.some((i) => i.productId === r.id) ? prev
                        : [...prev, { productId: r.id, name: r.name, qty: Math.max(r.min - r.stock, 1), unitCost: r.cost }]);
                      setTerm(""); setResults([]);
                    }}
                    className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                    <span>{r.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.stock} em estoque{r.min > 0 ? ` · mín. ${r.min}` : ""}
                      </span>
                    </span>
                    <span className="text-muted-foreground">custo {brl(r.cost)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr><th className="py-1">Produto</th><th className="py-1 text-center">Qtd.</th>
                    <th className="py-1 text-right">Custo un.</th><th className="py-1 text-right">Total</th><th /></tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={i.productId} className="border-b last:border-0">
                    <td className="py-1.5">{i.name}</td>
                    <td className="py-1.5 text-center">
                      <input type="number" min={1} value={i.qty}
                        onChange={(e) => setItems((prev) => prev.map((x, j) =>
                          j === idx ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))}
                        className="w-16 rounded border bg-transparent px-1 py-0.5 text-center" />
                    </td>
                    <td className="py-1.5 text-right">
                      <input inputMode="decimal" value={i.unitCost}
                        onChange={(e) => setItems((prev) => prev.map((x, j) =>
                          j === idx ? { ...x, unitCost: Number(e.target.value.replace(",", ".")) || 0 } : x))}
                        className="w-24 rounded border bg-transparent px-1 py-0.5 text-right" />
                    </td>
                    <td className="py-1.5 text-right font-medium">{brl(i.qty * i.unitCost)}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => setItems((prev) => prev.filter((_, j) => j !== idx))}
                        className="text-muted-foreground hover:text-destructive">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex justify-between border-t pt-2 font-bold">
            <span>Total do pedido</span><span>{brl(total)}</span>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="lg" onClick={submit} disabled={pending || items.length === 0 || !supplierId}>
        {pending ? "Criando…" : "Criar e enviar pedido"}
      </Button>
    </div>
  );
}
