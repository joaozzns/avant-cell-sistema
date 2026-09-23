"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { brl, parseDecimal } from "@/lib/format";
import { rotuloPagamento } from "@/lib/pagamentos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { salvarForma, type FaixaParcela } from "./actions";

export type Forma = {
  id: string;
  tipo: string;
  nome: string;
  taxa: number;
  dias: number;
  parcelas: FaixaParcela[];
  ativa: boolean;
};

/* Faixas que a maquininha costuma cobrar separado. */
const FAIXAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const numero = (v: string) => parseDecimal(v);
const texto = (v: number) => (v ? String(v).replace(".", ",") : "");

export function FormasDePagamento({
  formas, vendidoSemTaxa,
}: {
  formas: Forma[]; vendidoSemTaxa: number;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [taxa, setTaxa] = useState("");
  const [dias, setDias] = useState("");
  const [faixas, setFaixas] = useState<Record<number, { taxa: string; dias: string }>>({});

  function abrir(f: Forma) {
    setErro(""); setAviso("");
    setEditando(f.id);
    setTaxa(texto(f.taxa));
    setDias(String(f.dias || 0));
    const mapa: Record<number, { taxa: string; dias: string }> = {};
    for (const p of f.parcelas) mapa[p.n] = { taxa: texto(p.fee_percent), dias: String(p.days ?? 0) };
    setFaixas(mapa);
  }

  function salvar(f: Forma) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await salvarForma({
        id: f.id,
        taxa: numero(taxa),
        dias: Number(dias) || 0,
        ativa: f.ativa,
        parcelas: FAIXAS.map((n) => ({
          n,
          fee_percent: numero(faixas[n]?.taxa ?? ""),
          days: Number(faixas[n]?.dias ?? "") || 0,
        })).filter((p) => p.fee_percent > 0),
      });
      if (r.error) { setErro(r.error); return; }
      setEditando(null);
      setAviso("Taxa salva. As próximas vendas guardam esta taxa; a conciliação passa a comparar com ela.");
      router.refresh();
    });
  }

  const semTaxa = formas.filter(
    (f) => ["debit", "credit", "credit_installments"].includes(f.tipo) && f.taxa === 0);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Formas de pagamento</h1>
        <p className="text-sm text-muted-foreground">
          A taxa que você negociou com a maquininha e o prazo em que o dinheiro cai. É com esse
          número que a conciliação compara o que a operadora realmente cobrou.
        </p>
      </div>

      {semTaxa.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{semTaxa.length} forma(s) de cartão sem taxa cadastrada.</strong>
          <p className="mt-1">
            Enquanto a taxa for zero, a conciliação aceita qualquer valor que a maquininha
            descontar — ela não tem com o que comparar.
            {vendidoSemTaxa > 0 && (
              <> Já passaram <strong>{brl(vendidoSemTaxa)}</strong> em cartão sem taxa registrada.</>
            )}
          </p>
        </div>
      )}

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="grid gap-3">
        {formas.map((f) => {
          const aberto = editando === f.id;
          const cartao = ["debit", "credit", "credit_installments"].includes(f.tipo);
          const parcelado = f.tipo === "credit_installments";
          return (
            <Card key={f.id} className={aberto ? "border-primary" : ""}>
              <CardHeader className="border-b py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{f.nome}</CardTitle>
                  <Badge variant="outline">{rotuloPagamento(f.tipo)}</Badge>
                  {cartao && f.taxa === 0 && <Badge variant="destructive">sem taxa</Badge>}
                  {f.taxa > 0 && (
                    <Badge variant="secondary">
                      {f.taxa.toString().replace(".", ",")}% · recebe em {f.dias} dia(s)
                    </Badge>
                  )}
                  {parcelado && f.parcelas.length > 0 && (
                    <Badge variant="secondary">{f.parcelas.length} faixa(s) de parcela</Badge>
                  )}
                  {cartao && (
                    <Button size="sm" variant={aberto ? "secondary" : "outline"} className="ml-auto"
                      onClick={() => (aberto ? setEditando(null) : abrir(f))}>
                      {aberto ? "Fechar" : "Editar taxa"}
                    </Button>
                  )}
                </div>
              </CardHeader>

              {aberto && (
                <CardContent className="grid gap-4 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      Taxa combinada (%)
                      <input value={taxa} onChange={(e) => setTaxa(e.target.value)}
                        placeholder="3,19" className="h-9 rounded-md border bg-background px-3" />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Dias para o dinheiro cair
                      <input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric"
                        placeholder="30" className="h-9 rounded-md border bg-background px-3" />
                    </label>
                  </div>

                  {parcelado && (
                    <div className="grid gap-2">
                      <p className="text-sm font-medium">Taxa por número de parcelas</p>
                      <p className="text-xs text-muted-foreground">
                        Preencha só as faixas que a sua maquininha cobra diferente. As que ficarem
                        em branco usam a taxa acima.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {FAIXAS.map((n) => (
                          <div key={n} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                            <span className="w-10 text-sm font-medium">{n}x</span>
                            <input
                              value={faixas[n]?.taxa ?? ""}
                              onChange={(e) => setFaixas((a) => ({ ...a, [n]: { ...a[n], taxa: e.target.value, dias: a[n]?.dias ?? "" } }))}
                              placeholder="%" className="h-8 w-20 rounded-md border bg-background px-2 text-sm" />
                            <input
                              value={faixas[n]?.dias ?? ""}
                              onChange={(e) => setFaixas((a) => ({ ...a, [n]: { ...a[n], dias: e.target.value, taxa: a[n]?.taxa ?? "" } }))}
                              placeholder="dias" inputMode="numeric"
                              className="h-8 w-20 rounded-md border bg-background px-2 text-sm" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    A taxa fica gravada em cada venda no momento em que ela é feita. Se você
                    renegociar amanhã, as vendas de hoje continuam sendo conferidas pela taxa de hoje.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button disabled={pendente} onClick={() => salvar(f)}>
                      {pendente ? "Salvando…" : "Salvar taxa"}
                    </Button>
                    <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
