"use client";

import { useActionState } from "react";
import { saveProduct, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Option = { id: string; name: string };

export function ProductForm({
  product,
  categories,
  brands,
}: {
  product?: Record<string, unknown> | null;
  categories: Option[];
  brands: Option[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveProduct,
    {}
  );
  const p = (product ?? {}) as Record<string, string | number | boolean | null>;

  return (
    <form action={formAction} className="grid max-w-3xl gap-6">
      {p.id && <input type="hidden" name="id" value={String(p.id)} />}

      <Card>
        <CardHeader><CardTitle>Dados básicos</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" name="name" defaultValue={String(p.name ?? "")} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Tipo</Label>
            <select id="type" name="type" defaultValue={String(p.type ?? "accessory")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="device">Aparelho</option>
              <option value="accessory">Acessório</option>
              <option value="part">Peça</option>
              <option value="service">Serviço</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category_id">Categoria</Label>
            <select id="category_id" name="category_id" defaultValue={String(p.category_id ?? "")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="brand_id">Marca</Label>
            <select id="brand_id" name="brand_id" defaultValue={String(p.brand_id ?? "")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">—</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="warranty_days">Garantia (dias)</Label>
            <Input id="warranty_days" name="warranty_days" type="number"
              defaultValue={String(p.warranty_days ?? 90)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="internal_code">Código interno</Label>
            <Input id="internal_code" name="internal_code" defaultValue={String(p.internal_code ?? "")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ean">EAN / código de barras</Label>
            <Input id="ean" name="ean" defaultValue={String(p.ean ?? "")} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" defaultValue={String(p.description ?? "")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Preços</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="cost">Custo (R$)</Label>
            <Input id="cost" name="cost" inputMode="decimal" defaultValue={String(p.cost ?? "0")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sale_price">Preço de venda (R$)</Label>
            <Input id="sale_price" name="sale_price" inputMode="decimal" defaultValue={String(p.sale_price ?? "0")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="min_price">Preço mínimo (R$)</Label>
            <Input id="min_price" name="min_price" inputMode="decimal" defaultValue={String(p.min_price ?? "0")} />
            <p className="text-xs text-muted-foreground">
              Abaixo disso só com permissão de gerente
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Controles</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="serialized" defaultChecked={Boolean(p.serialized)} />
            Controlar por IMEI / número de série (cada unidade é única)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="internal_use_only" defaultChecked={Boolean(p.internal_use_only)} />
            Peça de uso interno da bancada (não aparece no PDV)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirm_below_cost" />
            Confirmo vender abaixo do custo (se for o caso)
          </label>
        </CardContent>
      </Card>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar produto"}
        </Button>
      </div>
    </form>
  );
}
