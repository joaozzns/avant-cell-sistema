"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { brl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fecharInventario, salvarContagem } from "../actions";

export type ItemContagem = {
  id: string; nome: string; codigo: string | null;
  sistema: number; contado: number | null; segunda: number | null;
  final: number | null; impacto: number | null;
};

export function Contagem({
  id, situacao, cego, fechado, itens,
}: {
  id: string; situacao: string; cego: boolean; fechado: boolean; itens: ItemContagem[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [termo, setTermo] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const filtrados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return itens;
    return itens.filter((i) => i.nome.toLowerCase().includes(t) || (i.codigo ?? "").toLowerCase().includes(t));
  }, [itens, termo]);

  const jaContados = itens.filter((i) => i.contado !== null).length;
  const divergentes = itens.filter((i) => i.contado !== null && i.contado !== i.sistema);
  const impactoPrevisto = fechado
    ? itens.reduce((s, i) => s + (i.impacto ?? 0), 0)
    : null;

  function gravar() {
    setErro(""); setAviso("");
    const lista = Object.entries(valores)
      .filter(([, v]) => v !== "")
      .map(([item_id, v]) => ({ item_id, qty: Number(v.replace(",", ".")) || 0 }));
    if (!lista.length) { setErro("Digite ao menos uma contagem."); return; }
    iniciar(async () => {
      const r = await salvarContagem(id, lista);
      if (r.error) { setErro(r.error); return; }
      setAviso(`${r.contados} item(ns) registrados.`);
      setValores({});
      router.refresh();
    });
  }

  function fechar() {
    setErro(""); setAviso("");
    if (!confirm("Fechar o inventário? O saldo do sistema passa a ser o que foi contado, e cada diferença vira ajuste.")) return;
    iniciar(async () => {
      const r = await fecharInventario(id);
      if (r.error) { setErro(r.error); return; }
      setAviso(`Inventário fechado: ${r.ajustes} ajuste(s), impacto de ${brl(r.impacto ?? 0)}.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventário</h1>
          <p className="text-sm text-muted-foreground">
            {jaContados} de {itens.length} itens contados
            {cego && !fechado && " · contagem cega (o saldo do sistema fica escondido)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={fechado ? "default" : "secondary"}>{fechado ? "fechado" : situacao}</Badge>
          {!fechado && (
            <>
              <Button variant="outline" onClick={gravar} disabled={pendente}>Salvar contagem</Button>
              <Button onClick={fechar} disabled={pendente || jaContados === 0}>Fechar inventário</Button>
            </>
          )}
        </div>
      </div>

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {fechado && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">Itens ajustados</p>
            <p className="mt-1 text-xl font-bold">{itens.filter((i) => (i.impacto ?? 0) !== 0).length}</p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">Impacto no estoque</p>
            <p className={`mt-1 text-xl font-bold ${(impactoPrevisto ?? 0) < 0 ? "text-destructive" : ""}`}>
              {brl(impactoPrevisto ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">Itens conferidos</p>
            <p className="mt-1 text-xl font-bold">{jaContados}</p>
          </div>
        </div>
      )}

      {!fechado && divergentes.length > 0 && (
        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Diferenças até agora ({divergentes.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 pt-4 text-sm">
            {divergentes.slice(0, 8).map((i) => (
              <div key={i.id} className="flex justify-between">
                <span>{i.nome}</span>
                <span className={i.contado! < i.sistema ? "text-destructive" : "text-green-600"}>
                  contado {i.contado} · sistema {i.sistema}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b py-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar produto na lista" value={termo}
              onChange={(e) => setTermo(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-4">
          {filtrados.map((i) => {
            const conferido = i.contado !== null;
            const diferente = conferido && i.contado !== i.sistema;
            return (
              <div key={i.id} className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-sm ${diferente ? "border-destructive/40" : ""}`}>
                <span className="min-w-0 flex-1">
                  {i.nome}
                  {i.codigo && <span className="block text-xs text-muted-foreground">{i.codigo}</span>}
                </span>
                {(!cego || fechado) && <span className="text-xs text-muted-foreground">sistema {i.sistema}</span>}
                {fechado ? (
                  <span className="text-xs">
                    contado {i.final ?? i.contado ?? "—"}
                    {(i.impacto ?? 0) !== 0 && (
                      <span className={`ml-2 ${(i.impacto ?? 0) < 0 ? "text-destructive" : "text-green-600"}`}>
                        {brl(i.impacto ?? 0)}
                      </span>
                    )}
                  </span>
                ) : (
                  <Input inputMode="numeric" className="h-8 w-24"
                    placeholder={conferido ? String(i.contado) : "contar"}
                    value={valores[i.id] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [i.id]: e.target.value }))} />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
