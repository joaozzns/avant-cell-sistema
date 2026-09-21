"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { linkWhatsApp, SITUACAO_MENSAGEM } from "@/lib/mensagens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { avisarPorModelo, descartarAviso, marcarEnviado } from "../../clientes/avisos/actions";

export type AvisoOs = {
  id: string;
  corpo: string;
  situacao: string;
  erro: string | null;
  modelo: string;
  criado: string;
};

/** Avisos desta OS: o que já foi para o cliente e o que está esperando envio.
 *  Fica na tela da OS porque é ali que o atendente está quando o cliente liga
 *  perguntando "vocês me avisaram?". */
export function AvisosOs({
  osId, avisos, modelos, telefone,
}: {
  osId: string;
  avisos: AvisoOs[];
  modelos: { key: string; name: string }[];
  telefone: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [escolhido, setEscolhido] = useState(modelos[0]?.key ?? "");

  function escrever() {
    if (!escolhido) return;
    setErro("");
    iniciar(async () => {
      const r = await avisarPorModelo(osId, escolhido);
      if (r.error) setErro(r.error);
      router.refresh();
    });
  }

  function enviar(a: AvisoOs) {
    const link = linkWhatsApp(telefone, a.corpo);
    if (link) window.open(link, "_blank", "noopener");
    iniciar(async () => {
      await marcarEnviado(a.id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">Avisos ao cliente</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4">
        {modelos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)}
              className="h-9 min-w-[12rem] flex-1 rounded-md border bg-background px-2 text-sm">
              {modelos.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={pendente} onClick={escrever}>
              Escrever aviso
            </Button>
          </div>
        )}

        {avisos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum aviso ainda. Os automáticos aparecem aqui quando a OS muda de situação.
          </p>
        )}

        {avisos.map((a) => (
          <div key={a.id} className={`grid gap-2 rounded-lg border p-3 ${a.situacao === "queued" ? "border-primary/50 bg-primary/5" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong>{a.modelo}</strong>
              <Badge variant={a.situacao === "queued" ? "secondary" : a.situacao === "failed" ? "destructive" : "outline"}>
                {a.erro === "Descartado pelo atendente" ? "descartado" : SITUACAO_MENSAGEM[a.situacao] ?? a.situacao}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(a.criado)}</span>
            </div>
            <pre className="whitespace-pre-wrap text-sm">{a.corpo}</pre>
            {a.situacao === "queued" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pendente || !telefone} onClick={() => enviar(a)}>
                  <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
                </Button>
                <Button size="sm" variant="outline" disabled={pendente}
                  onClick={() => iniciar(async () => { await marcarEnviado(a.id); router.refresh(); })}>
                  Já avisei
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente}
                  onClick={() => iniciar(async () => { await descartarAviso(a.id); router.refresh(); })}>
                  Descartar
                </Button>
              </div>
            )}
          </div>
        ))}

        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </CardContent>
    </Card>
  );
}
