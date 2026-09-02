"use client";

import { useActionState } from "react";
import { createPayable, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Option = { id: string; name: string };

export function PayableForm({ categories, costCenters }: {
  categories: Option[]; costCenters: Option[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPayable, {});
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Novo lançamento</CardTitle></CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <Input name="description" placeholder="Descrição (ex.: aluguel setembro)" className="w-64" required />
          <Input name="amount" placeholder="Valor (R$)" inputMode="decimal" className="w-32" required />
          <div className="grid gap-1">
            <Input name="due_date" type="date" required />
          </div>
          <select name="category_id" className="h-9 rounded-md border bg-transparent px-3 text-sm">
            <option value="">Categoria…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="cost_center_id" className="h-9 rounded-md border bg-transparent px-3 text-sm">
            <option value="">Centro de custo…</option>
            {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Lançando…" : "Lançar"}
          </Button>
          {state?.ok && <span className="text-sm text-green-600">Lançado ✓</span>}
          {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
        </form>
      </CardContent>
    </Card>
  );
}
