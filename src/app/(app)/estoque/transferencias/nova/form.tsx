"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buscarParaTransferir, criarTransferencia, type ItemTransferencia } from "../actions";

type Escolhido = ItemTransferencia & { rotulo: string; detalhe: string; maximo?: number };

export function FormTransferencia({ lojas }: { lojas: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [destino, setDestino] = useState(lojas[0]?.id ?? "");
  const [obs, setObs] = useState("");
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof buscarParaTransferir>>>({ unidades: [], produtos: [] });
  const [itens, setItens] = useState<Escolhido[]>([]);
  const [erro, setErro] = useState("");

  async function buscar(t: string) {
    setTermo(t);
    setResultado(await buscarParaTransferir(t));
  }

  function adicionarUnidade(u: { id: string; imei: string | null; nome: string; detalhe: string; productId: string }) {
    if (itens.some((i) => i.unitId === u.id)) return;
    setItens((l) => [...l, {
      productId: u.productId, unitId: u.id, qty: 1,
      rotulo: u.nome, detalhe: `IMEI ${u.imei}${u.detalhe ? ` · ${u.detalhe}` : ""}`,
    }]);
    setTermo(""); setResultado({ unidades: [], produtos: [] });
  }

  function adicionarProduto(p: { productId: string; variantId: string | null; nome: string; saldo: number }) {
    if (itens.some((i) => i.productId === p.productId && !i.unitId)) return;
    setItens((l) => [...l, {
      productId: p.productId, variantId: p.variantId, qty: 1,
      rotulo: p.nome, detalhe: `${p.saldo} em estoque aqui`, maximo: p.saldo,
    }]);
    setTermo(""); setResultado({ unidades: [], produtos: [] });
  }

  function salvar() {
    setErro("");
    iniciar(async () => {
      const r = await criarTransferencia(destino, itens.map(({ productId, variantId, unitId, qty }) => ({
        productId, variantId, unitId, qty,
      })), obs);
      if (r.error) { setErro(r.error); return; }
      router.push(`/estoque/transferencias/${r.id}`);
      router.refresh();
    });
  }

  return (
    <div className="grid max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nova transferência</h1>
        <p className="text-sm text-muted-foreground">
          Monte a lista aqui. O estoque só sai quando você enviar, na tela seguinte.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">Para onde vai</CardTitle></CardHeader>
        <CardContent className="grid gap-3 pt-4">
          <div className="grid gap-1.5">
            <Label>Loja de destino</Label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm">
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Observação (opcional)</Label>
            <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: levar na van das 14h" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">O que vai</CardTitle></CardHeader>
        <CardContent className="grid gap-3 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={termo} onChange={(e) => buscar(e.target.value)}
              placeholder="Buscar por IMEI ou nome do produto" />
            {(resultado.unidades.length > 0 || resultado.produtos.length > 0) && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-lg">
                {resultado.unidades.map((u) => (
                  <button key={u.id} onClick={() => adicionarUnidade(u)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                    {u.nome} <span className="text-muted-foreground">· IMEI {u.imei}</span>
                  </button>
                ))}
                {resultado.produtos.map((p) => (
                  <button key={p.productId} onClick={() => adicionarProduto(p)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                    {p.nome} <span className="text-muted-foreground">· {p.saldo} em estoque</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item na lista ainda.</p>
          ) : (
            <div className="grid gap-2">
              {itens.map((i, k) => (
                <div key={`${i.unitId ?? i.productId}-${k}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <strong>{i.rotulo}</strong>
                    <span className="block text-xs text-muted-foreground">{i.detalhe}</span>
                  </span>
                  {!i.unitId && (
                    <Input type="number" min={1} max={i.maximo} value={i.qty} className="h-8 w-20"
                      onChange={(e) => {
                        const q = Math.max(1, Math.min(Number(e.target.value) || 1, i.maximo ?? 9999));
                        setItens((l) => l.map((x, idx) => idx === k ? { ...x, qty: q } : x));
                      }} />
                  )}
                  <button onClick={() => setItens((l) => l.filter((_, idx) => idx !== k))}
                    className="rounded-md border p-1.5 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/estoque/transferencias")}>Cancelar</Button>
        <Button onClick={salvar} disabled={pendente || itens.length === 0}>
          {pendente ? "Criando…" : "Criar transferência"}
        </Button>
      </div>
    </div>
  );
}
