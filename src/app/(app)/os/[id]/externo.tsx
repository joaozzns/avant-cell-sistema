"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { brl, fmtDate, fmtDateTime, parseDecimal } from "@/lib/format";
import { ETAPAS_EXTERNO, ROTULO_EXTERNO, atrasado, diasCorridos } from "@/lib/externo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  atualizarEnvio, enviarParaLaboratorio, enviosDaOs, fornecedoresAtivos,
  type EnvioExterno,
} from "./externo-actions";

/** Aparelho que sai da loja para um laboratório: prazo, custo combinado e
 *  retorno conferido. Enquanto estiver fora, a OS mostra aqui onde ele está. */
export function ServicoExterno({ osId, temFoto }: { osId: string; temFoto: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [envios, setEnvios] = useState<EnvioExterno[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [erro, setErro] = useState("");
  const [abrindo, setAbrindo] = useState(false);

  const [fornecedorId, setFornecedorId] = useState("");
  const [parceiro, setParceiro] = useState("");
  const [prazo, setPrazo] = useState("");
  const [custo, setCusto] = useState("");
  const [rastreio, setRastreio] = useState("");
  const [observacao, setObservacao] = useState("");

  const [recebendo, setRecebendo] = useState<string | null>(null);
  const [custoFinal, setCustoFinal] = useState("");
  const [divergencia, setDivergencia] = useState("");
  const [vencimento, setVencimento] = useState("");

  useEffect(() => {
    enviosDaOs(osId).then(setEnvios);
    fornecedoresAtivos().then(setFornecedores);
  }, [osId]);

  const aberto = envios.find((e) => e.situacao !== "received");

  async function recarregar() {
    setEnvios(await enviosDaOs(osId));
    router.refresh();
  }

  function enviar() {
    setErro("");
    const nome = fornecedorId
      ? fornecedores.find((f) => f.id === fornecedorId)?.nome ?? ""
      : parceiro.trim();
    if (!nome) { setErro("Diga para quem o aparelho está indo."); return; }
    iniciar(async () => {
      const r = await enviarParaLaboratorio({
        osId,
        fornecedorId: fornecedorId || null,
        parceiro: nome,
        prazo: prazo || null,
        custo: custo ? parseDecimal(custo) : null,
        rastreio,
        observacao,
      });
      if (r.error) { setErro(r.error); return; }
      setAbrindo(false);
      setFornecedorId(""); setParceiro(""); setPrazo(""); setCusto(""); setRastreio(""); setObservacao("");
      await recarregar();
    });
  }

  function avancar(envio: EnvioExterno, situacao: string) {
    setErro("");
    iniciar(async () => {
      const r = await atualizarEnvio({ id: envio.id, osId, situacao });
      if (r.error) { setErro(r.error); return; }
      await recarregar();
    });
  }

  function registrarRetorno(envio: EnvioExterno) {
    setErro("");
    iniciar(async () => {
      const r = await atualizarEnvio({
        id: envio.id, osId, situacao: "received",
        custo: custoFinal ? parseDecimal(custoFinal) : envio.custoCombinado,
        divergencia,
        vencimento: vencimento || null,
      });
      if (r.error) { setErro(r.error); return; }
      setRecebendo(null); setCustoFinal(""); setDivergencia(""); setVencimento("");
      await recarregar();
    });
  }

  return (
    <Card>
      <CardHeader className="border-b py-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Laboratório externo</CardTitle>
          {aberto && (
            <Badge variant={atrasado(aberto.prazo, aberto.situacao) ? "destructive" : "secondary"}>
              fora há {diasCorridos(aberto.enviadoEm)} dia(s)
            </Badge>
          )}
          {!aberto && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAbrindo((a) => !a)}>
              {abrindo ? "Fechar" : "Enviar para laboratório"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4">
        {abrindo && !aberto && (
          <div className="grid gap-3 rounded-lg border p-3">
            {!temFoto && (
              <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                Esta OS ainda não tem foto do aparelho. Fotografe antes de mandar para fora — é o que
                resolve discussão com o parceiro sobre risco novo na tela ou peça trocada.
              </p>
            )}

            <label className="grid gap-1 text-sm">
              Parceiro cadastrado
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}
                className="h-9 rounded-md border bg-background px-2">
                <option value="">— outro (digitar o nome) —</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>

            {!fornecedorId && (
              <label className="grid gap-1 text-sm">
                Nome do laboratório
                <input value={parceiro} onChange={(e) => setParceiro(e.target.value)}
                  placeholder="Ex.: Microsolda do Léo"
                  className="h-9 rounded-md border bg-background px-3" />
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                Previsão de retorno
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Custo combinado
                <input value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00"
                  className="h-9 rounded-md border bg-background px-3" />
              </label>
              <label className="grid gap-1 text-sm">
                Código de rastreio
                <input value={rastreio} onChange={(e) => setRastreio(e.target.value)}
                  className="h-9 rounded-md border bg-background px-3" />
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              O que foi combinado
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
                placeholder="Ex.: troca do conector de carga; devolver com a tela original."
                className="rounded-md border bg-background px-3 py-2" />
            </label>

            <div>
              <Button onClick={enviar} disabled={pendente}>
                <Truck className="h-4 w-4" /> {pendente ? "Registrando…" : "Registrar envio"}
              </Button>
            </div>
          </div>
        )}

        {envios.length === 0 && !abrindo && (
          <p className="text-sm text-muted-foreground">
            Nenhum serviço terceirizado nesta OS.
          </p>
        )}

        {envios.map((e) => {
          const etapa = ETAPAS_EXTERNO.findIndex((x) => x.valor === e.situacao);
          const proxima = ETAPAS_EXTERNO[etapa + 1];
          const emAtraso = atrasado(e.prazo, e.situacao);
          return (
            <div key={e.id} className={`grid gap-2 rounded-lg border p-3 ${emAtraso ? "border-destructive/50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <strong>{e.parceiro}</strong>
                <Badge variant={e.situacao === "received" ? "outline" : "secondary"}>
                  {ROTULO_EXTERNO[e.situacao] ?? e.situacao}
                </Badge>
                {emAtraso && <Badge variant="destructive">atrasado</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  enviado {fmtDateTime(e.enviadoEm)}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {e.prazo && <span>previsão {fmtDate(e.prazo)}</span>}
                {e.custoCombinado !== null && <span>combinado {brl(e.custoCombinado)}</span>}
                {e.custoReal !== null && e.custoReal !== e.custoCombinado && (
                  <span className="text-foreground">cobrado {brl(e.custoReal)}</span>
                )}
                {e.rastreio && <span>rastreio {e.rastreio}</span>}
                {e.recebidoEm && <span>recebido {fmtDateTime(e.recebidoEm)}</span>}
                {e.contaId && <span>conta a pagar lançada</span>}
              </div>

              {e.observacao && <p className="text-sm">{e.observacao}</p>}
              {e.divergencia && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  Divergência no retorno: {e.divergencia}
                </p>
              )}

              {e.situacao !== "received" && recebendo !== e.id && (
                <div className="flex flex-wrap gap-2">
                  {proxima && proxima.valor !== "received" && (
                    <Button size="sm" variant="outline" disabled={pendente}
                      onClick={() => avancar(e, proxima.valor)} title={proxima.ajuda}>
                      {proxima.rotulo}
                    </Button>
                  )}
                  <Button size="sm" disabled={pendente} onClick={() => {
                    setRecebendo(e.id);
                    setCustoFinal(e.custoCombinado ? String(e.custoCombinado).replace(".", ",") : "");
                  }}>
                    Registrar retorno
                  </Button>
                </div>
              )}

              {recebendo === e.id && (
                <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      Quanto o parceiro cobrou
                      <input value={custoFinal} onChange={(ev) => setCustoFinal(ev.target.value)}
                        placeholder="0,00" className="h-9 rounded-md border bg-background px-3" />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Vencimento da conta
                      <input type="date" value={vencimento} onChange={(ev) => setVencimento(ev.target.value)}
                        className="h-9 rounded-md border bg-background px-2" />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm">
                    Voltou diferente do que foi? (opcional)
                    <textarea value={divergencia} onChange={(ev) => setDivergencia(ev.target.value)} rows={2}
                      placeholder="Ex.: voltou com risco novo na traseira; veio sem o parafuso inferior."
                      className="rounded-md border bg-background px-3 py-2" />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Ao confirmar, o custo entra no resultado da OS e vira conta a pagar do parceiro.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pendente} onClick={() => registrarRetorno(e)}>
                      {pendente ? "Registrando…" : "Confirmar retorno"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRecebendo(null)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </CardContent>
    </Card>
  );
}
