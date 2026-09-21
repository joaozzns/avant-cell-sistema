"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, X } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { linkWhatsApp, SITUACAO_MENSAGEM } from "@/lib/mensagens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { descartarAviso, marcarEnviado } from "./actions";

export type Aviso = {
  id: string;
  cliente: string;
  telefone: string | null;
  corpo: string;
  situacao: string;
  erro: string | null;
  modelo: string;
  criado: string;
  osId: string | null;
  osNumero: number | null;
};

export function FilaAvisos({ avisos }: { avisos: Aviso[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [textos, setTextos] = useState<Record<string, string>>({});

  const fila = avisos.filter((a) => a.situacao === "queued");
  const historico = avisos.filter((a) => a.situacao !== "queued").slice(0, 30);

  function texto(a: Aviso) {
    return textos[a.id] ?? a.corpo;
  }

  function enviar(a: Aviso) {
    setErro("");
    const link = linkWhatsApp(a.telefone, texto(a));
    if (link) window.open(link, "_blank", "noopener");
    iniciar(async () => {
      const r = await marcarEnviado(a.id, textos[a.id]);
      if (r.error) setErro(r.error);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avisos ao cliente</h1>
        <p className="text-sm text-muted-foreground">
          O sistema escreve a mensagem quando a OS muda de situação. Confira o texto e envie —
          o botão abre o WhatsApp com tudo digitado. Quem enviou e quando fica registrado.
        </p>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Na fila ({fila.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          {fila.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum aviso esperando. Assim que uma OS mudar de situação, a mensagem aparece aqui.
            </p>
          )}
          {fila.map((a) => (
            <div key={a.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{a.cliente}</strong>
                <Badge variant="secondary">{a.modelo}</Badge>
                {a.osNumero && a.osId && (
                  <Link href={`/os/${a.osId}`} className="text-xs text-primary underline">
                    OS #{a.osNumero}
                  </Link>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(a.criado)}</span>
              </div>

              <textarea
                value={texto(a)} rows={Math.min(8, texto(a).split("\n").length + 1)}
                onChange={(e) => setTextos((t) => ({ ...t, [a.id]: e.target.value }))}
                className="rounded-md border bg-background px-3 py-2 text-sm" />

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={pendente || !a.telefone} onClick={() => enviar(a)}>
                  <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
                </Button>
                <Button size="sm" variant="outline" disabled={pendente}
                  onClick={() => iniciar(async () => { await marcarEnviado(a.id, textos[a.id]); router.refresh(); })}>
                  <Check className="h-4 w-4" /> Já avisei
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente}
                  onClick={() => iniciar(async () => { await descartarAviso(a.id); router.refresh(); })}>
                  <X className="h-4 w-4" /> Descartar
                </Button>
                {!a.telefone && (
                  <span className="text-xs text-destructive">Cliente sem WhatsApp cadastrado.</span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Últimos avisos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-4 text-sm">
          {historico.length === 0 && <p className="text-muted-foreground">Nada enviado ainda.</p>}
          {historico.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
              <span className="min-w-0 flex-1">
                {a.cliente}
                <span className="block truncate text-xs text-muted-foreground">
                  {a.modelo}{a.osNumero ? ` · OS #${a.osNumero}` : ""} · {a.corpo.split("\n")[0]}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(a.criado)}</span>
              <Badge variant={a.situacao === "failed" ? "destructive" : "outline"}>
                {a.erro === "Descartado pelo atendente" ? "descartado" : SITUACAO_MENSAGEM[a.situacao] ?? a.situacao}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
