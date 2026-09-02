"use client";

import { useActionState } from "react";
import { registerUnit, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function UnitForm({ products }: { products: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    registerUnit,
    {}
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dar entrada em aparelho</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Produto (modelo) *</Label>
            <select name="product_id" required
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">Selecione…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Condição</Label>
            <select name="condition" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="new">Novo</option>
              <option value="seminew">Seminovo</option>
              <option value="showcase">Vitrine</option>
              <option value="used">Usado</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label>IMEI 1 * (15 dígitos)</Label>
            <Input name="imei1" inputMode="numeric" maxLength={15} required />
          </div>
          <div className="grid gap-2">
            <Label>IMEI 2</Label>
            <Input name="imei2" inputMode="numeric" maxLength={15} />
          </div>
          <div className="grid gap-2">
            <Label>Nº de série</Label>
            <Input name="serial_number" />
          </div>
          <div className="grid gap-2">
            <Label>Cor</Label>
            <Input name="color" />
          </div>
          <div className="grid gap-2">
            <Label>Capacidade</Label>
            <Input name="capacity" placeholder="128GB" />
          </div>
          <div className="grid gap-2">
            <Label>Custo (R$)</Label>
            <Input name="cost" inputMode="decimal" defaultValue="0" />
          </div>
          <div className="grid gap-2">
            <Label>Preço de venda (R$)</Label>
            <Input name="sale_price" inputMode="decimal" />
          </div>
          <div className="flex items-end gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Registrando…" : "Registrar entrada"}
            </Button>
            {state?.ok && <span className="text-sm text-green-600">Aparelho registrado ✓</span>}
            {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
