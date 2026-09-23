"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { brl, fmtDate, parseDecimal } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { definirLimite, situacaoCrediario, type SituacaoCrediario } from "./crediario-actions";

/** Quanto o cliente ainda pode levar a prazo — e quem decide isso.
 *  Sem limite aprovado, a venda a prazo é recusada no balcão. */
export function Crediario({ clienteId, nome }: { clienteId: string; nome: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [s, setS] = useState<SituacaoCrediario | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [limite, setLimite] = useState("");
  const [renda, setRenda] = useState("");
  const [bloquear, setBloquear] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => { situacaoCrediario(clienteId).then(setS); }, [clienteId]);

  function abrir() {
    setErro(""); setAviso("");
    setLimite(s?.limite ? String(s.limite).replace(".", ",") : "");
    setBloquear(Boolean(s?.bloqueado));
    setMotivo(s?.motivo ?? "");
    setAbrindo(true);
  }

  function salvar() {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await definirLimite({
        clienteId,
        limite: parseDecimal(limite),
        bloqueado: bloquear,
        motivoBloqueio: motivo,
        rendaDeclarada: renda ? parseDecimal(renda) : null,
        observacao: "",
        justificativa,
      });
      if (r.error) { setErro(r.error); return; }
      setAbrindo(false);
      setJustificativa("");
      setS(await situacaoCrediario(clienteId));
      setAviso("Limite atualizado. A alteração ficou registrada na auditoria.");
      router.refresh();
    });
  }

  const semLimite = !s || s.limite <= 0;

  return (
    <Card>
      <CardHeader className="border-b py-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Crediário</CardTitle>
          {s?.bloqueado && <Badge variant="destructive">bloqueado</Badge>}
          {s?.vencidaEm && <Badge variant="destructive">parcela vencida</Badge>}
          {!s?.bloqueado && !s?.vencidaEm && semLimite && (
            <Badge variant="outline">sem limite aprovado</Badge>
          )}
          <Button size="sm" variant="outline" className="ml-auto"
            onClick={() => (abrindo ? setAbrindo(false) : abrir())}>
            {abrindo ? "Fechar" : semLimite ? "Aprovar limite" : "Revisar limite"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 pt-4 text-sm">
        {!s && <p className="text-muted-foreground">Carregando…</p>}

        {s && !abrindo && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Limite</p>
                <p className="font-bold">{brl(s.limite)}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Em aberto</p>
                <p className="font-bold">{brl(s.usado)}</p>
              </div>
              <div className={`rounded-lg border p-2 ${s.disponivel <= 0 ? "border-destructive/40" : ""}`}>
                <p className="text-xs text-muted-foreground">Pode levar</p>
                <p className="font-bold">{brl(s.disponivel)}</p>
              </div>
            </div>

            {s.vencidaEm && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Parcela vencida desde {fmtDate(s.vencidaEm)}. Enquanto não regularizar, a venda a
                prazo é recusada no balcão.
              </p>
            )}
            {s.bloqueado && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Cliente bloqueado{s.motivo ? `: ${s.motivo}` : ""}.
              </p>
            )}
            {semLimite && !s.bloqueado && (
              <p className="text-xs text-muted-foreground">
                Sem limite aprovado, {nome.split(" ")[0]} só compra à vista. Aprovar limite exige
                permissão de crediário e fica registrado.
              </p>
            )}
          </>
        )}

        {abrindo && (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                Limite de crediário
                <input value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="0,00"
                  className="h-9 rounded-md border bg-background px-3" />
              </label>
              <label className="grid gap-1">
                Renda declarada (opcional)
                <input value={renda} onChange={(e) => setRenda(e.target.value)} placeholder="0,00"
                  className="h-9 rounded-md border bg-background px-3" />
              </label>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={bloquear}
                onChange={(e) => setBloquear(e.target.checked)} />
              Bloquear novas compras a prazo
            </label>
            {bloquear && (
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo do bloqueio"
                className="h-9 rounded-md border bg-background px-3" />
            )}

            <label className="grid gap-1">
              Por que este limite (fica na auditoria)
              <input value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Ex.: cliente antigo, sempre pagou em dia"
                className="h-9 rounded-md border bg-background px-3" />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={pendente} onClick={salvar}>
                {pendente ? "Salvando…" : "Salvar limite"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAbrindo(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {aviso && <p className="text-green-700 dark:text-green-400">{aviso}</p>}
        {erro && <p className="text-destructive">{erro}</p>}
      </CardContent>
    </Card>
  );
}
