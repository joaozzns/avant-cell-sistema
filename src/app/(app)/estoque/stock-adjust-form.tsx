"use client";

import { useActionState } from "react";
import { stockAdjust, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StockAdjustForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    stockAdjust,
    {}
  );

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Ajuste rápido de estoque</CardTitle></CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="product_id" value={productId} />
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Direção</label>
            <select name="direction" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">Quantidade</label>
            <Input name="qty" inputMode="decimal" className="w-24" defaultValue="1" />
          </div>
          <div className="grid min-w-56 flex-1 gap-1">
            <label className="text-xs text-muted-foreground">Motivo (obrigatório)</label>
            <Input name="reason" placeholder="ex.: entrada inicial, conferência…" />
          </div>
          <Button type="submit" disabled={pending} variant="secondary">
            {pending ? "Aplicando…" : "Aplicar"}
          </Button>
          {state?.ok && <span className="text-sm text-green-600">Ajuste aplicado ✓</span>}
          {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
        </form>
      </CardContent>
    </Card>
  );
}
