"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { abrirInventario } from "./actions";

export function NovoInventario({ categorias }: { categorias: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [categoria, setCategoria] = useState("");
  const [cego, setCego] = useState(true);
  const [erro, setErro] = useState("");

  return (
    <Card>
      <CardHeader className="border-b py-4"><CardTitle className="text-base">Começar um inventário</CardTitle></CardHeader>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm">
          O que vai contar
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Loja inteira</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cego} onChange={() => setCego(!cego)} className="h-4 w-4" />
          Contagem cega
        </label>
        <Button disabled={pendente} onClick={() => {
          setErro("");
          iniciar(async () => {
            const r = await abrirInventario(categoria || null, cego);
            if (r.error) { setErro(r.error); return; }
            router.push(`/estoque/inventario/${r.id}`);
            router.refresh();
          });
        }}>
          {pendente ? "Abrindo…" : "Abrir inventário"}
        </Button>
        {erro && <p className="text-sm text-destructive sm:col-span-3">{erro}</p>}
      </CardContent>
    </Card>
  );
}
