"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Crown, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { brl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { definirPrincipal, trocarLink } from "./actions";

export type Vendedor = {
  id: string;
  nome: string;
  email: string;
  principal: boolean;
  link: string;
  vendeu: number;
  vendas: number;
  comissao: number;
  meta: number;
};

export function ListaVendedores({
  vendedores, periodo,
}: {
  vendedores: Vendedor[]; periodo: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

  const comissionados = vendedores.filter((v) => !v.principal);
  const totalVendido = vendedores.reduce((s, v) => s + v.vendeu, 0);
  const totalComissao = comissionados.reduce((s, v) => s + v.comissao, 0);
  const principal = vendedores.find((v) => v.principal);

  function copiar(v: Vendedor) {
    navigator.clipboard.writeText(v.link);
    setCopiado(v.id);
    setTimeout(() => setCopiado(null), 2000);
  }

  function agir(fn: () => Promise<{ error?: string }>, msg: string) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await fn();
      if (r.error) { setErro(r.error); return; }
      setAviso(msg);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendedores</h1>
        <p className="text-sm text-muted-foreground">
          Cada vendedor tem um link próprio para acompanhar as vendas dele, a comissão e a meta —
          no celular, sem precisar de acesso ao sistema.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Vendido no mês", brl(totalVendido)],
          ["Comissão da equipe", brl(totalComissao)],
          ["Vendedores comissionados", String(comissionados.length)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      {!principal && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Nenhum vendedor principal definido. O principal enxerga os números da loja inteira e
          <strong> não entra na apuração de comissão</strong> — normalmente é o dono.
        </p>
      )}

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="grid gap-3">
        {vendedores.map((v) => {
          const pct = v.meta > 0 ? Math.min((v.vendeu / v.meta) * 100, 100) : null;
          return (
            <Card key={v.id} className={v.principal ? "border-primary/50" : ""}>
              <CardHeader className="border-b py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{v.nome}</CardTitle>
                  {v.principal && (
                    <Badge><Crown className="mr-1 h-3 w-3" /> principal</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{v.email}</span>
                  <Button size="sm" variant={v.principal ? "secondary" : "ghost"} className="ml-auto"
                    disabled={pendente}
                    onClick={() => agir(
                      () => definirPrincipal(v.id, !v.principal),
                      v.principal
                        ? `${v.nome} deixou de ser o principal e volta a receber comissão.`
                        : `${v.nome} é o vendedor principal: vê a loja inteira e sai da apuração de comissão.`,
                    )}>
                    {v.principal ? "Deixar de ser principal" : "Tornar principal"}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="grid gap-3 pt-4">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Vendeu ({periodo})</p>
                    <p className="font-bold">{brl(v.vendeu)}</p>
                    <p className="text-xs text-muted-foreground">{v.vendas} venda(s)</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Comissão</p>
                    <p className="font-bold">{v.principal ? "—" : brl(v.comissao)}</p>
                    {v.principal && <p className="text-xs text-muted-foreground">não comissiona</p>}
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Meta</p>
                    <p className="font-bold">{v.meta > 0 ? brl(v.meta) : "—"}</p>
                    {pct !== null && (
                      <p className="text-xs text-muted-foreground">{Math.round(pct)}% atingido</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs font-medium">Link pessoal</p>
                  <code className="block truncate rounded bg-background px-2 py-1 text-xs">{v.link}</code>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copiar(v)}>
                      <Copy className="h-4 w-4" /> {copiado === v.id ? "Copiado!" : "Copiar link"}
                    </Button>
                    <a href={v.link} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-4 w-4" /> Abrir
                      </Button>
                    </a>
                    <a href={`https://wa.me/?text=${encodeURIComponent(
                      `Olá ${v.nome.split(" ")[0]}! Este é o seu painel de vendas na loja: ${v.link}`)}`}
                      target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
                      </Button>
                    </a>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente}
                      onClick={() => {
                        if (!confirm(`Trocar o link de ${v.nome}?\n\nO link atual para de funcionar na hora.`)) return;
                        agir(() => trocarLink(v.id), "Link trocado. Envie o novo para o vendedor.");
                      }}>
                      <RefreshCw className="h-4 w-4" /> Trocar link
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quem tem o link vê o painel. Se alguém sair da equipe, troque o link.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
