"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarAtalhos } from "./actions";
import { PADRAO, type Atalho } from "@/lib/atalhos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GripVertical, X } from "lucide-react";

export function EscolhaDeAtalhos({
  catalogo, escolhidos: iniciais, personalizado,
}: { catalogo: Atalho[]; escolhidos: string[]; personalizado: boolean }) {
  const router = useRouter();
  const [escolhidos, setEscolhidos] = useState<string[]>(iniciais);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

  const porId = (id: string) => catalogo.find((a) => a.id === id);
  const grupos = [...new Set(catalogo.map((a) => a.grupo))];

  function alternar(id: string) {
    setSalvo(false);
    setEscolhidos((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]);
  }

  function mover(id: string, direcao: -1 | 1) {
    setSalvo(false);
    setEscolhidos((atual) => {
      const i = atual.indexOf(id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const novo = [...atual];
      [novo[i], novo[j]] = [novo[j], novo[i]];
      return novo;
    });
  }

  function salvar() {
    setErro(""); setSalvo(false);
    iniciar(async () => {
      const r = await salvarAtalhos(escolhidos);
      if (r.error) { setErro(r.error); return; }
      setSalvo(true);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold">Atalhos do painel</h1>
        <p className="text-sm text-muted-foreground">
          Escolha o que aparece na tela inicial, na ordem que você usa.
          {!personalizado && " Hoje você está vendo o conjunto padrão."}
        </p>
      </div>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">
            Na sua tela inicial ({escolhidos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          {escolhidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum atalho escolhido. Escolha pelo menos um abaixo — sem
              nenhum, o painel volta ao conjunto padrão.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {escolhidos.map((id, i) => {
                const a = porId(id);
                if (!a) return null;
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{a.rotulo}</span>
                    <span className="text-xs text-muted-foreground">{a.grupo}</span>
                    <button
                      onClick={() => mover(id, -1)} disabled={i === 0 || pendente}
                      className="px-1.5 text-muted-foreground disabled:opacity-30 hover:text-primary"
                      title="Subir" aria-label={`Subir ${a.rotulo}`}
                    >↑</button>
                    <button
                      onClick={() => mover(id, 1)} disabled={i === escolhidos.length - 1 || pendente}
                      className="px-1.5 text-muted-foreground disabled:opacity-30 hover:text-primary"
                      title="Descer" aria-label={`Descer ${a.rotulo}`}
                    >↓</button>
                    <button
                      onClick={() => alternar(id)} disabled={pendente}
                      className="px-1 text-muted-foreground hover:text-destructive"
                      title="Tirar do painel" aria-label={`Tirar ${a.rotulo}`}
                    ><X className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Disponíveis</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5">
          {grupos.map((g) => {
            const doGrupo = catalogo.filter((a) => a.grupo === g && !escolhidos.includes(a.id));
            if (!doGrupo.length) return null;
            return (
              <div key={g}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
                <div className="flex flex-wrap gap-2">
                  {doGrupo.map((a) => (
                    <button
                      key={a.id} onClick={() => alternar(a.id)} disabled={pendente}
                      className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                    >
                      + {a.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {salvo && <p className="text-sm text-green-600">Atalhos salvos.</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={pendente || escolhidos.length === 0}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          variant="outline" disabled={pendente}
          onClick={() => { setEscolhidos(PADRAO); setSalvo(false); }}
        >
          Voltar ao padrão
        </Button>
      </div>
    </div>
  );
}
