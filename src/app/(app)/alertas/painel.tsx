"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, RefreshCw } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { GRAVIDADE, TIPO_ALERTA, destinoDoAlerta } from "@/lib/alertas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adiar, recalcular, resolver } from "./actions";

export type Alerta = {
  id: string;
  tipo: string;
  gravidade: string;
  titulo: string;
  corpo: string | null;
  refTabela: string | null;
  refId: string | null;
  situacao: string;
  adiadoAte: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
};

export function PainelAlertas({ alertas }: { alertas: Alerta[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const abertos = alertas
    .filter((a) => a.situacao === "open")
    .sort((a, b) => (GRAVIDADE[a.gravidade]?.ordem ?? 9) - (GRAVIDADE[b.gravidade]?.ordem ?? 9));
  const adiados = alertas.filter((a) => a.situacao === "snoozed");
  const resolvidos = alertas.filter((a) => a.situacao === "resolved").slice(0, 20);
  const urgentes = abertos.filter((a) => a.gravidade === "critical").length;

  function agir(fn: () => Promise<{ error?: string }>, mensagem?: string) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await fn();
      if (r.error) { setErro(r.error); return; }
      if (mensagem) setAviso(mensagem);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">O que precisa de você</h1>
          <p className="text-sm text-muted-foreground">
            O sistema varre estoque, oficina, caixa e fiscal e junta aqui o que está fora do lugar.
            Some sozinho quando o problema acaba.
          </p>
        </div>
        <Button variant="outline" disabled={pendente}
          onClick={() => agir(async () => {
            const r = await recalcular();
            if (!("error" in r)) {
              setAviso(`${r.novos} alerta(s) novo(s) · ${r.resolvidos} resolvido(s) sozinho(s).`);
            }
            return r as { error?: string };
          })}>
          <RefreshCw className="h-4 w-4" /> {pendente ? "Verificando…" : "Verificar agora"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Precisam de ação", String(abertos.length)],
          ["Urgentes", String(urgentes)],
          ["Adiados", String(adiados.length)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Em aberto ({abertos.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 pt-4">
          {abertos.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nada fora do lugar. Clique em &ldquo;Verificar agora&rdquo; para conferir de novo.
            </p>
          )}
          {abertos.map((a) => (
            <div key={a.id}
              className={`grid gap-2 rounded-lg border p-3 ${a.gravidade === "critical" ? "border-destructive/50 bg-destructive/5" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={a.gravidade === "critical" ? "destructive" : "secondary"}>
                  {GRAVIDADE[a.gravidade]?.rotulo ?? a.gravidade}
                </Badge>
                <Badge variant="outline">{TIPO_ALERTA[a.tipo]?.rotulo ?? a.tipo}</Badge>
                <strong className="text-sm">{a.titulo}</strong>
                <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(a.criadoEm)}</span>
              </div>
              {a.corpo && <p className="text-sm text-muted-foreground">{a.corpo}</p>}
              <div className="flex flex-wrap gap-2">
                <Link href={destinoDoAlerta(a.tipo, a.refTabela, a.refId)}>
                  <Button size="sm" variant="outline">Resolver agora</Button>
                </Link>
                <Button size="sm" variant="ghost" disabled={pendente}
                  onClick={() => agir(() => resolver(a.id), "Alerta marcado como resolvido.")}>
                  <Check className="h-4 w-4" /> Já resolvi
                </Button>
                <Button size="sm" variant="ghost" disabled={pendente}
                  onClick={() => agir(() => adiar(a.id, 1))}>
                  <Clock className="h-4 w-4" /> Amanhã
                </Button>
                <Button size="sm" variant="ghost" disabled={pendente}
                  onClick={() => agir(() => adiar(a.id, 7))}>
                  Semana que vem
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {adiados.length > 0 && (
        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Adiados ({adiados.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 pt-4 text-sm">
            {adiados.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
                <span className="min-w-0 flex-1">
                  {a.titulo}
                  <span className="block text-xs text-muted-foreground">
                    volta a aparecer {a.adiadoAte ? fmtDate(a.adiadoAte) : "—"}
                  </span>
                </span>
                <Button size="sm" variant="ghost" disabled={pendente}
                  onClick={() => agir(() => resolver(a.id))}>Já resolvi</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Resolvidos recentemente</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-4 text-sm">
          {resolvidos.length === 0 && <p className="text-muted-foreground">Nada resolvido ainda.</p>}
          {resolvidos.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
              <span className="min-w-0 flex-1 text-muted-foreground">{a.titulo}</span>
              {a.resolvidoEm && (
                <span className="text-xs text-muted-foreground">{fmtDate(a.resolvidoEm)}</span>
              )}
              <Badge variant="outline">{TIPO_ALERTA[a.tipo]?.rotulo ?? a.tipo}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
