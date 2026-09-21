"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { VARIAVEIS, MODELOS_PADRAO, preencher } from "@/lib/mensagens";
import { OS_STATUS } from "../../os/os-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { instalarModelosPadrao, salvarModelo } from "./actions";

export type Modelo = {
  id: string;
  key: string;
  name: string;
  body: string;
  auto_on_status: string | null;
  active: boolean;
};

/* Só faz sentido avisar o cliente nestas situações — "em teste" ou "em reparo"
   é conversa de bancada, não notícia para quem está esperando o aparelho. */
const GATILHOS = [
  "open", "awaiting_approval", "approved", "awaiting_part", "ready", "unrepaired", "delivered",
];

const EXEMPLO: Record<string, string> = Object.fromEntries(
  VARIAVEIS.map((v) => [v.chave, v.exemplo]),
);

export function EditorModelos({ modelos }: { modelos: Modelo[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Modelo | null>(null);

  function abrir(m: Modelo) {
    setErro(""); setAviso("");
    setEditando(m.key);
    setRascunho({ ...m });
  }

  function salvar() {
    if (!rascunho) return;
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await salvarModelo({
        key: rascunho.key,
        name: rascunho.name,
        body: rascunho.body,
        auto_on_status: rascunho.auto_on_status,
        active: rascunho.active,
      });
      if (r.error) { setErro(r.error); return; }
      setEditando(null);
      setAviso("Modelo salvo.");
      router.refresh();
    });
  }

  function instalar() {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await instalarModelosPadrao();
      if (r.error) { setErro(r.error); return; }
      setAviso(
        r.instalados
          ? `${r.instalados} modelos instalados.` +
            (r.manuais ? ` ${r.manuais} modelo(s) antigo(s) passaram para envio manual, para o cliente não receber duas mensagens.` : "")
          : "Todos os modelos já estavam instalados.",
      );
      router.refresh();
    });
  }

  function inserirVariavel(chave: string) {
    if (!rascunho) return;
    setRascunho({ ...rascunho, body: `${rascunho.body}{{${chave}}}` });
  }

  const faltando = MODELOS_PADRAO.filter((p) => !modelos.some((m) => m.key === p.key));

  /* mesma situação em dois modelos ativos: o cliente receberia duas mensagens */
  const porGatilho = new Map<string, string[]>();
  for (const m of modelos) {
    if (!m.active || !m.auto_on_status) continue;
    porGatilho.set(m.auto_on_status, [...(porGatilho.get(m.auto_on_status) ?? []), m.name]);
  }
  const conflitos = [...porGatilho.entries()].filter(([, nomes]) => nomes.length > 1);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modelos de mensagem</h1>
          <p className="text-sm text-muted-foreground">
            O texto que o cliente recebe em cada etapa da OS. Marque a situação que dispara o aviso e
            o sistema escreve sozinho — o atendente só confere e envia.
          </p>
        </div>
        {faltando.length > 0 && (
          <Button onClick={instalar} disabled={pendente}>
            {pendente ? "Instalando…" : `Instalar ${faltando.length} modelos prontos`}
          </Button>
        )}
      </div>

      {conflitos.map(([situacao, nomes]) => (
        <p key={situacao} className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{nomes.join(" e ")}</strong> disparam na mesma situação ({OS_STATUS[situacao]?.label ?? situacao}) —
          o cliente receberia duas mensagens. Salve o que você quer manter: o outro passa para envio manual.
        </p>
      ))}

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {modelos.length === 0 && (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-10 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum modelo ainda. Instale os prontos e ajuste o texto do seu jeito.
            </p>
            <Button onClick={instalar} disabled={pendente}>Instalar modelos prontos</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {modelos.map((m) => {
          const aberto = editando === m.key;
          const atual = aberto && rascunho ? rascunho : m;
          return (
            <Card key={m.key} className={aberto ? "border-primary" : ""}>
              <CardHeader className="border-b py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{m.name}</CardTitle>
                  {m.auto_on_status ? (
                    <Badge variant="secondary">
                      automático · {OS_STATUS[m.auto_on_status]?.label ?? m.auto_on_status}
                    </Badge>
                  ) : (
                    <Badge variant="outline">envio manual</Badge>
                  )}
                  {!m.active && <Badge variant="destructive">desligado</Badge>}
                  <Button size="sm" variant={aberto ? "secondary" : "outline"} className="ml-auto"
                    onClick={() => (aberto ? setEditando(null) : abrir(m))}>
                    {aberto ? "Fechar" : "Editar"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4">
                {!aberto && (
                  <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{m.body}</pre>
                )}

                {aberto && rascunho && (
                  <>
                    <label className="grid gap-1 text-sm">
                      Nome do modelo
                      <input value={rascunho.name}
                        onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })}
                        className="h-9 rounded-md border bg-background px-3" />
                    </label>

                    <label className="grid gap-1 text-sm">
                      Mensagem
                      <textarea value={rascunho.body} rows={6}
                        onChange={(e) => setRascunho({ ...rascunho, body: e.target.value })}
                        className="rounded-md border bg-background px-3 py-2 font-mono text-sm" />
                    </label>

                    <div className="flex flex-wrap gap-1.5">
                      {VARIAVEIS.map((v) => (
                        <button key={v.chave} type="button" title={v.descricao}
                          onClick={() => inserirVariavel(v.chave)}
                          className="rounded-md border px-2 py-1 font-mono text-xs hover:bg-muted">
                          {`{{${v.chave}}}`}
                        </button>
                      ))}
                    </div>

                    <label className="grid gap-1 text-sm">
                      Enviar automaticamente quando a OS ficar
                      <select value={rascunho.auto_on_status ?? ""}
                        onChange={(e) => setRascunho({ ...rascunho, auto_on_status: e.target.value || null })}
                        className="h-9 rounded-md border bg-background px-2">
                        <option value="">Nunca — só quando o atendente mandar</option>
                        {GATILHOS.map((g) => (
                          <option key={g} value={g}>{OS_STATUS[g]?.label ?? g}</option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={rascunho.active}
                        onChange={(e) => setRascunho({ ...rascunho, active: e.target.checked })} />
                      Modelo em uso
                    </label>

                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Como o cliente vai ver:</p>
                      <pre className="whitespace-pre-wrap rounded-lg border bg-[#dcf8c6] p-3 text-sm text-black">
                        {preencher(atual.body, EXEMPLO)}
                      </pre>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={salvar} disabled={pendente}>
                        {pendente ? "Salvando…" : "Salvar modelo"}
                      </Button>
                      <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
