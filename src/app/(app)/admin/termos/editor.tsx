"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime } from "@/lib/format";
import { TIPOS_TERMO, ehTextoDeExemplo } from "@/lib/termos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { publicarTermo } from "./actions";

export type TermoSalvo = {
  tipo: string;
  versao: number;
  texto: string;
  ativo: boolean;
  criadoEm: string;
  autor: string | null;
};

export function EditorTermos({ termos }: { termos: TermoSalvo[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [historico, setHistorico] = useState<string | null>(null);

  function abrir(tipo: string, atual: string) {
    setErro(""); setAviso("");
    setEditando(tipo);
    setTexto(atual);
  }

  function publicar(tipo: string) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await publicarTermo(tipo, texto);
      if (r.error) { setErro(r.error); return; }
      setEditando(null);
      setAviso(`Publicada a versão ${r.versao}. As OS e recibos daqui em diante usam este texto; os anteriores continuam com a versão que o cliente assinou.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Termos da loja</h1>
        <p className="text-sm text-muted-foreground">
          O que sai impresso na ordem de serviço e no recibo. Editar aqui cria uma <strong>versão
          nova</strong> — o texto que o cliente já assinou continua guardado, do jeito que ele assinou.
        </p>
      </div>

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {TIPOS_TERMO.map((t) => {
        const versoes = termos.filter((x) => x.tipo === t.chave);
        const atual = versoes.find((x) => x.ativo) ?? versoes[0];
        const usandoPadrao = !atual || ehTextoDeExemplo(atual.texto);
        const conteudo = usandoPadrao ? t.padrao : atual.texto;
        const aberto = editando === t.chave;

        return (
          <Card key={t.chave} className={aberto ? "border-primary" : ""}>
            <CardHeader className="border-b py-4">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{t.titulo}</CardTitle>
                {usandoPadrao
                  ? <Badge variant="destructive">texto padrão do sistema</Badge>
                  : <Badge variant="secondary">versão {atual.versao}</Badge>}
                <Button size="sm" variant={aberto ? "secondary" : "outline"} className="ml-auto"
                  onClick={() => (aberto ? setEditando(null) : abrir(t.chave, conteudo))}>
                  {aberto ? "Fechar" : usandoPadrao ? "Escrever o meu" : "Editar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t.onde}</p>
            </CardHeader>

            <CardContent className="grid gap-3 pt-4">
              {!aberto && (
                <>
                  <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{conteudo}</pre>
                  {usandoPadrao && (
                    <p className="text-xs text-muted-foreground">
                      Sua loja ainda não escreveu este termo: o sistema está imprimindo um texto padrão,
                      genérico. Vale adaptar ao que a sua loja realmente pratica.
                    </p>
                  )}
                  {versoes.length > 1 && (
                    <button type="button" onClick={() => setHistorico(historico === t.chave ? null : t.chave)}
                      className="justify-self-start text-xs text-primary underline underline-offset-4">
                      {historico === t.chave ? "esconder" : `ver as ${versoes.length} versões`}
                    </button>
                  )}
                  {historico === t.chave && (
                    <div className="grid gap-2">
                      {versoes.map((v) => (
                        <div key={v.versao} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant={v.ativo ? "default" : "outline"}>versão {v.versao}</Badge>
                            <span>{fmtDateTime(v.criadoEm)}</span>
                            {v.autor && <span>· {v.autor}</span>}
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap text-xs">{v.texto}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {aberto && (
                <>
                  <textarea value={texto} rows={10}
                    onChange={(e) => setTexto(e.target.value)}
                    className="rounded-md border bg-background px-3 py-2 text-sm" />
                  <p className="text-xs text-muted-foreground">
                    {t.chave === "service_term"
                      ? "Cada linha vira uma cláusula numerada na impressão da OS."
                      : "O texto sai como um parágrafo só."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={pendente} onClick={() => publicar(t.chave)}>
                      {pendente ? "Publicando…" : "Publicar nova versão"}
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
  );
}
