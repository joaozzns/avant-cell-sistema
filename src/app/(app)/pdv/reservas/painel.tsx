"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus } from "lucide-react";
import { brl, fmtDate } from "@/lib/format";
import { linkWhatsApp } from "@/lib/mensagens";
import { ABERTAS, SITUACAO_RESERVA, diasParaRetirada, vencida } from "@/lib/reservas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { atualizarReserva, expirarVencidas } from "./actions";

export type Reserva = {
  id: string;
  cliente: string;
  telefone: string | null;
  produto: string | null;
  descricao: string | null;
  imei: string | null;
  detalheUnidade: string | null;
  precoCombinado: number | null;
  sinal: number;
  politica: string | null;
  situacao: string;
  prazo: string | null;
  criadaEm: string;
  creditoHoje: number;
};

export function PainelReservas({ reservas }: { reservas: Reserva[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [encerrando, setEncerrando] = useState<string | null>(null);
  const [reter, setReter] = useState(false);
  const [motivo, setMotivo] = useState("");

  const abertas = reservas.filter((r) => ABERTAS.includes(r.situacao));
  const encerradas = reservas.filter((r) => !ABERTAS.includes(r.situacao)).slice(0, 30);
  const vencidas = abertas.filter((r) => vencida(r.prazo, r.situacao));
  const emSinal = abertas.reduce((s, r) => s + r.sinal, 0);

  function mudar(r: Reserva, situacao: string) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const res = await atualizarReserva({ id: r.id, situacao });
      if (res.error) { setErro(res.error); return; }
      if (situacao === "delivered") {
        setAviso(
          r.creditoHoje > 0
            ? `Produto liberado. Feche a venda no PDV: o cliente tem ${brl(r.creditoHoje)} de crédito para abater.`
            : "Produto liberado. Feche a venda no PDV.",
        );
      }
      router.refresh();
    });
  }

  function encerrar(r: Reserva, situacao: "canceled" | "expired") {
    setErro("");
    iniciar(async () => {
      const res = await atualizarReserva({
        id: r.id, situacao, reterSinal: reter, motivo,
      });
      if (res.error) { setErro(res.error); return; }
      setEncerrando(null); setReter(false); setMotivo("");
      setAviso(res.retido ? `Sinal de ${brl(res.retido)} retido pela loja.` : "Reserva encerrada; o sinal continua como crédito do cliente.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservas e encomendas</h1>
          <p className="text-sm text-muted-foreground">
            Produto guardado no nome do cliente, com sinal e prazo. Passou do prazo, volta para a venda —
            e o sinal continua sendo do cliente até alguém decidir o contrário.
          </p>
        </div>
        <Link href="/pdv/reservas/nova">
          <Button><Plus className="h-4 w-4" /> Nova reserva</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Reservas abertas", String(abertas.length)],
          ["Passaram do prazo", String(vencidas.length)],
          ["Sinais recebidos", brl(emSinal)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      {vencidas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="flex-1">
            {vencidas.length} reserva(s) passaram do prazo de retirada e continuam segurando produto.
          </span>
          <Button size="sm" variant="outline" disabled={pendente}
            onClick={() => iniciar(async () => {
              const r = await expirarVencidas();
              if (r.error) setErro(r.error);
              else setAviso(`${r.vencidas} reserva(s) vencidas; os produtos voltaram para a venda.`);
              router.refresh();
            })}>
            Liberar as vencidas
          </Button>
        </div>
      )}

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Em aberto ({abertas.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          {abertas.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma reserva aberta.</p>
          )}
          {abertas.map((r) => {
            const atrasada = vencida(r.prazo, r.situacao);
            const dias = diasParaRetirada(r.prazo);
            const wa = linkWhatsApp(
              r.telefone,
              `Olá ${r.cliente.split(" ")[0]}! Seu ${r.produto ?? r.descricao ?? "produto"} está reservado aqui na loja${r.prazo ? ` até ${fmtDate(r.prazo)}` : ""}.`,
            );
            return (
              <div key={r.id} className={`grid gap-2 rounded-lg border p-3 ${atrasada ? "border-destructive/50" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong>{r.cliente}</strong>
                  <Badge variant={r.situacao === "available" ? "default" : "secondary"}
                    title={SITUACAO_RESERVA[r.situacao]?.ajuda}>
                    {SITUACAO_RESERVA[r.situacao]?.rotulo ?? r.situacao}
                  </Badge>
                  {atrasada && <Badge variant="destructive">venceu {fmtDate(r.prazo)}</Badge>}
                  {!atrasada && dias !== null && dias <= 2 && (
                    <Badge variant="outline">retirar em {dias} dia(s)</Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    reservado {fmtDate(r.criadaEm)}
                  </span>
                </div>

                <div className="text-sm">
                  {r.produto ?? r.descricao}
                  {r.imei && <span className="ml-2 font-mono text-xs text-muted-foreground">IMEI {r.imei}</span>}
                  {r.detalheUnidade && <span className="ml-2 text-xs text-muted-foreground">{r.detalheUnidade}</span>}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {r.precoCombinado !== null && <span>combinado {brl(r.precoCombinado)}</span>}
                  {r.sinal > 0 && <span>sinal {brl(r.sinal)}</span>}
                  {r.creditoHoje > 0 && <span>crédito do cliente hoje {brl(r.creditoHoje)}</span>}
                  {r.prazo && <span>retirar até {fmtDate(r.prazo)}</span>}
                  {r.politica && <span>{r.politica}</span>}
                </div>

                {encerrando !== r.id ? (
                  <div className="flex flex-wrap gap-2">
                    {r.situacao === "awaiting_purchase" && (
                      <Button size="sm" variant="outline" disabled={pendente}
                        onClick={() => mudar(r, "on_the_way")}>Pedido feito</Button>
                    )}
                    {r.situacao !== "available" && (
                      <Button size="sm" variant="outline" disabled={pendente}
                        onClick={() => mudar(r, "available")}>Chegou na loja</Button>
                    )}
                    {r.situacao === "available" && (
                      <Button size="sm" disabled={pendente} onClick={() => mudar(r, "delivered")}>
                        Entregar ao cliente
                      </Button>
                    )}
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
                        <MessageCircle className="h-4 w-4" /> Avisar
                      </a>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente}
                      onClick={() => setEncerrando(r.id)}>
                      Encerrar
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
                    <p className="text-sm">
                      O produto volta para a venda. O sinal de {brl(r.sinal)} continua como crédito
                      do cliente, a não ser que a loja decida ficar com ele.
                      {r.creditoHoje !== r.sinal && r.sinal > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          O crédito é um saldo único do cliente: hoje ele tem {brl(r.creditoHoje)} no total.
                        </span>
                      )}
                    </p>
                    {r.sinal > 0 && (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4" checked={reter}
                            onChange={(e) => setReter(e.target.checked)} />
                          Ficar com o sinal (exige permissão e motivo)
                        </label>
                        {reter && (
                          <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                            placeholder="Motivo: o que foi combinado com o cliente"
                            className="h-9 rounded-md border bg-background px-3 text-sm" />
                        )}
                      </>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="destructive" disabled={pendente}
                        onClick={() => encerrar(r, "canceled")}>
                        Cliente desistiu
                      </Button>
                      <Button size="sm" variant="outline" disabled={pendente}
                        onClick={() => encerrar(r, "expired")}>
                        Não veio buscar
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => { setEncerrando(null); setReter(false); setMotivo(""); }}>
                        Voltar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Encerradas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-4 text-sm">
          {encerradas.length === 0 && <p className="text-muted-foreground">Nada encerrado ainda.</p>}
          {encerradas.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
              <span className="min-w-0 flex-1">
                {r.cliente}
                <span className="block truncate text-xs text-muted-foreground">
                  {r.produto ?? r.descricao}{r.sinal > 0 && ` · sinal ${brl(r.sinal)}`}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{fmtDate(r.criadaEm)}</span>
              <Badge variant="outline">{SITUACAO_RESERVA[r.situacao]?.rotulo ?? r.situacao}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
