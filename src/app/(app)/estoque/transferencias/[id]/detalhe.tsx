"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cancelarTransferencia, enviarTransferencia, receberTransferencia } from "../actions";

export type ItemDetalhe = {
  id: string; nome: string; imei: string | null; detalhe: string;
  qtd: number; recebido: number | null; divergencia: string | null; comImei: boolean;
};

const SITUACAO: Record<string, { rotulo: string; cor: "default" | "secondary" | "destructive" | "outline" }> = {
  separating: { rotulo: "separando", cor: "outline" },
  sent: { rotulo: "enviada", cor: "secondary" },
  in_transit: { rotulo: "em trânsito", cor: "secondary" },
  received: { rotulo: "recebida", cor: "default" },
  divergent: { rotulo: "com divergência", cor: "destructive" },
  canceled: { rotulo: "cancelada", cor: "destructive" },
};

export function DetalheTransferencia(p: {
  id: string; situacao: string; origem: string; destino: string; obs: string | null;
  criadaEm: string; enviadaEm: string | null; recebidaEm: string | null;
  itens: ItemDetalhe[]; souOrigem: boolean; souDestino: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [conferencia, setConferencia] = useState<Record<string, number>>(
    Object.fromEntries(p.itens.map((i) => [i.id, i.recebido ?? i.qtd])),
  );

  const s = SITUACAO[p.situacao] ?? { rotulo: p.situacao, cor: "outline" as const };
  const podeEnviar = p.situacao === "separating" && p.souOrigem;
  const podeReceber = ["in_transit", "sent"].includes(p.situacao) && p.souDestino;

  function acao(fn: () => Promise<{ error?: string }>) {
    setErro("");
    iniciar(async () => {
      const r = await fn();
      if (r.error) { setErro(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="grid max-w-3xl gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{p.origem} → {p.destino}</h1>
        <Badge variant={s.cor}>{s.rotulo}</Badge>
      </div>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent className="grid gap-2 pt-4 text-sm">
          {p.itens.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <span className="min-w-0 flex-1">
                <strong>{i.nome}</strong>
                <span className="block text-xs text-muted-foreground">
                  {i.imei ? `IMEI ${i.imei}` : `${i.qtd} unidade(s)`}
                  {i.detalhe && ` · ${i.detalhe}`}
                </span>
                {i.divergencia && <span className="block text-xs text-destructive">divergência: {i.divergencia}</span>}
              </span>
              {podeReceber ? (
                <label className="flex items-center gap-2 text-xs">
                  recebido
                  <Input type="number" min={0} max={i.qtd} className="h-8 w-20"
                    value={conferencia[i.id]}
                    onChange={(e) => setConferencia((c) => ({
                      ...c, [i.id]: Math.max(0, Math.min(Number(e.target.value) || 0, i.qtd)),
                    }))} />
                </label>
              ) : i.recebido !== null ? (
                <span className={i.recebido < i.qtd ? "text-destructive" : "text-green-600"}>
                  recebido {i.recebido} de {i.qtd}
                </span>
              ) : null}
            </div>
          ))}
          {p.obs && <p className="text-xs text-muted-foreground">Obs.: {p.obs}</p>}
          <p className="text-xs text-muted-foreground">
            criada {fmtDateTime(p.criadaEm)}
            {p.enviadaEm && ` · enviada ${fmtDateTime(p.enviadaEm)}`}
            {p.recebidaEm && ` · recebida ${fmtDateTime(p.recebidaEm)}`}
          </p>
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/estoque/transferencias")}>Voltar</Button>
        {podeEnviar && (
          <>
            <Button variant="outline" disabled={pendente}
              onClick={() => acao(() => cancelarTransferencia(p.id))}>Cancelar transferência</Button>
            <Button disabled={pendente} onClick={() => acao(() => enviarTransferencia(p.id))}>
              {pendente ? "Enviando…" : "Enviar (baixa o estoque daqui)"}
            </Button>
          </>
        )}
        {podeReceber && (
          <Button disabled={pendente} onClick={() => acao(async () => {
            const r = await receberTransferencia(p.id, p.itens.map((i) => ({
              item_id: i.id, qty_received: conferencia[i.id] ?? 0,
              divergence: (conferencia[i.id] ?? 0) < i.qtd ? "chegou menos do que saiu" : undefined,
            })));
            return r;
          })}>
            {pendente ? "Recebendo…" : "Confirmar recebimento"}
          </Button>
        )}
      </div>
    </div>
  );
}
