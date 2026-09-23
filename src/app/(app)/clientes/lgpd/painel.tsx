"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ShieldOff } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { anonimizar, encerrarPedido, exportarDados } from "./actions";

export type PedidoLgpd = {
  id: string;
  clienteId: string;
  cliente: string;
  documento: string | null;
  jaAnonimizado: boolean;
  tipo: string;
  situacao: string;
  pedidoEm: string;
  prazo: string | null;
  concluidoEm: string | null;
  observacao: string | null;
};

const TIPO: Record<string, string> = {
  export: "Cópia dos dados",
  anonymization: "Anonimização",
  deletion: "Exclusão",
};

function vencido(prazo: string | null, situacao: string) {
  if (!prazo || situacao !== "open") return false;
  return new Date(prazo + "T23:59:59") < new Date();
}

export function PainelLgpd({ pedidos, anonimizados }: { pedidos: PedidoLgpd[]; anonimizados: number }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const abertos = pedidos.filter((p) => p.situacao === "open");
  const fechados = pedidos.filter((p) => p.situacao !== "open").slice(0, 30);
  const atrasados = abertos.filter((p) => vencido(p.prazo, p.situacao));

  function baixar(p: PedidoLgpd) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await exportarDados(p.clienteId);
      if (r.error || !r.arquivo) { setErro(r.error ?? "Falha ao gerar o arquivo."); return; }
      const url = URL.createObjectURL(new Blob([r.arquivo], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.nome ?? "dados.json"; a.click();
      URL.revokeObjectURL(url);
      setAviso("Arquivo gerado. Entregue ao titular e marque o pedido como atendido.");
    });
  }

  function anonimizarCliente(p: PedidoLgpd) {
    setErro(""); setAviso("");
    if (!confirm(
      `Anonimizar ${p.cliente}?\n\nNome, CPF, contato e endereço são apagados e não voltam. ` +
      `As vendas, notas e OS continuam guardadas, ligadas a um cliente sem nome.`)) return;
    iniciar(async () => {
      const r = await anonimizar(p.clienteId, p.id);
      if (r.error) { setErro(r.error); return; }
      setAviso(`Dados de ${r.nomeAnterior} anonimizados. O histórico fiscal continua guardado.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pedidos LGPD</h1>
        <p className="text-sm text-muted-foreground">
          O cliente pode pedir uma cópia dos dados que a loja guarda sobre ele, ou pedir para sair da
          base. A loja tem <strong>15 dias</strong> para responder.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Pedidos em aberto", String(abertos.length)],
          ["Fora do prazo", String(atrasados.length)],
          ["Clientes anonimizados", String(anonimizados)],
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
        <CardContent className="grid gap-3 pt-4">
          {abertos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum pedido em aberto. Abra um pelo cadastro do cliente quando alguém pedir.
            </p>
          )}
          {abertos.map((p) => (
            <div key={p.id} className={`grid gap-2 rounded-lg border p-3 ${vencido(p.prazo, p.situacao) ? "border-destructive/50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/clientes/${p.clienteId}`} className="font-medium text-primary underline">
                  {p.cliente}
                </Link>
                {p.documento && <span className="text-xs text-muted-foreground">{p.documento}</span>}
                <Badge variant="secondary">{TIPO[p.tipo] ?? p.tipo}</Badge>
                {vencido(p.prazo, p.situacao)
                  ? <Badge variant="destructive">venceu {fmtDate(p.prazo)}</Badge>
                  : p.prazo && <Badge variant="outline">responder até {fmtDate(p.prazo)}</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  pedido em {fmtDateTime(p.pedidoEm)}
                </span>
              </div>
              {p.observacao && <p className="text-sm text-muted-foreground">{p.observacao}</p>}

              {recusando === p.id ? (
                <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="O que foi feito, ou por que o pedido não pode ser atendido"
                    className="h-9 rounded-md border bg-background px-3 text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pendente}
                      onClick={() => iniciar(async () => {
                        const r = await encerrarPedido(p.id, motivo);
                        if (r.error) { setErro(r.error); return; }
                        setRecusando(null); setMotivo(""); router.refresh();
                      })}>
                      Encerrar pedido
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRecusando(null)}>Voltar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={pendente} onClick={() => baixar(p)}>
                    <Download className="h-4 w-4" /> Baixar os dados
                  </Button>
                  {!p.jaAnonimizado && p.tipo !== "export" && (
                    <Button size="sm" variant="destructive" disabled={pendente}
                      onClick={() => anonimizarCliente(p)}>
                      <ShieldOff className="h-4 w-4" /> Anonimizar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setRecusando(p.id)}>
                    Encerrar sem anonimizar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">Encerrados</CardTitle></CardHeader>
        <CardContent className="grid gap-1.5 pt-4 text-sm">
          {fechados.length === 0 && <p className="text-muted-foreground">Nenhum pedido encerrado.</p>}
          {fechados.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
              <span className="min-w-0 flex-1">
                {p.cliente}
                <span className="block truncate text-xs text-muted-foreground">
                  {TIPO[p.tipo] ?? p.tipo}{p.observacao && ` · ${p.observacao}`}
                </span>
              </span>
              {p.concluidoEm && (
                <span className="text-xs text-muted-foreground">{fmtDate(p.concluidoEm)}</span>
              )}
              <Badge variant={p.situacao === "done" ? "default" : "outline"}>
                {p.situacao === "done" ? "atendido" : "encerrado"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
