"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarComissao } from "./actions";
import { brl, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type LinhaAssinatura = {
  id: string; loja: string; plano: string | null; situacao: string;
  periodo: string; mensal: number; cobrado: number | null;
  venceEm: string | null; carenciaAte: string | null;
  ultimoPagamento: string | null; desde: string | null;
  ligadaAoMercadoPago: boolean; representante: string | null;
};

export type LinhaComissao = {
  id: string; representante: string; loja: string; valor: number;
  base: string; ganhoEm: string; pagoEm: string | null;
};

const SITUACAO: Record<string, { texto: string; cor: string }> = {
  active:    { texto: "Em dia",        cor: "text-green-600" },
  trial:     { texto: "Avaliação",     cor: "text-blue-600" },
  past_due:  { texto: "Em carência",   cor: "text-amber-600" },
  read_only: { texto: "Só leitura",    cor: "text-destructive" },
  canceled:  { texto: "Cancelada",     cor: "text-muted-foreground" },
};

export function PainelCobranca({
  assinaturas, comissoes,
}: { assinaturas: LinhaAssinatura[]; comissoes: LinhaComissao[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  const ativas = assinaturas.filter((a) => a.situacao === "active");
  const mrr = ativas.reduce((s, a) => s + a.mensal, 0);
  const atrasadas = assinaturas.filter((a) => ["past_due", "read_only"].includes(a.situacao));
  const aPagar = comissoes.filter((c) => !c.pagoEm);
  const totalAPagar = aPagar.reduce((s, c) => s + c.valor, 0);

  function alternar(id: string, paga: boolean) {
    setErro("");
    iniciar(async () => {
      const r = await marcarComissao(id, paga);
      if (r.error) { setErro(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold">Cobrança</h1>
        <p className="text-sm text-muted-foreground">
          O que cada loja paga, quem está atrasado e o que os representantes têm a receber.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Receita recorrente</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{brl(mrr)}</p>
            <p className="text-xs text-muted-foreground">{ativas.length} assinatura(s) em dia</p>
          </CardContent>
        </Card>
        <Card className={atrasadas.length ? "border-amber-500" : undefined}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Em atraso</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{atrasadas.length}</p>
            <p className="text-xs text-muted-foreground">
              {atrasadas.filter((a) => a.situacao === "read_only").length} já em só-leitura
            </p>
          </CardContent>
        </Card>
        <Card className={totalAPagar > 0 ? "border-blue-500" : undefined}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Comissão a repassar</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{brl(totalAPagar)}</p>
            <p className="text-xs text-muted-foreground">{aPagar.length} comissão(ões)</p>
          </CardContent>
        </Card>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Assinaturas</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {assinaturas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma assinatura ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5">Loja</th>
                  <th className="py-1.5">Plano</th>
                  <th className="py-1.5">Situação</th>
                  <th className="py-1.5 text-right">Mensal</th>
                  <th className="py-1.5">Vence</th>
                  <th className="py-1.5">Representante</th>
                </tr>
              </thead>
              <tbody>
                {assinaturas.map((a) => {
                  const s = SITUACAO[a.situacao] ?? { texto: a.situacao, cor: "" };
                  return (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-1.5">
                        {a.loja}
                        {!a.ligadaAoMercadoPago && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (sem cobrança automática)
                          </span>
                        )}
                      </td>
                      <td className="py-1.5">
                        {a.plano ?? "—"}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {a.periodo === "annual" ? "anual" : "mensal"}
                        </span>
                      </td>
                      <td className={`py-1.5 ${s.cor}`}>
                        {s.texto}
                        {a.situacao === "past_due" && a.carenciaAte && (
                          <span className="block text-xs">até {fmtDate(a.carenciaAte)}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">{brl(a.mensal)}</td>
                      <td className="py-1.5">{a.venceEm ? fmtDate(a.venceEm) : "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{a.representante ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Comissões</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {comissoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma comissão ainda. Elas nascem quando o primeiro pagamento de uma
              loja indicada é confirmado.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5">Representante</th>
                  <th className="py-1.5">Loja</th>
                  <th className="py-1.5">Como foi formada</th>
                  <th className="py-1.5 text-right">Valor</th>
                  <th className="py-1.5">Ganha em</th>
                  <th className="py-1.5 text-right">Repasse</th>
                </tr>
              </thead>
              <tbody>
                {comissoes.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1.5">{c.representante}</td>
                    <td className="py-1.5">{c.loja}</td>
                    <td className="py-1.5 text-xs text-muted-foreground">{c.base}</td>
                    <td className="py-1.5 text-right font-medium">{brl(c.valor)}</td>
                    <td className="py-1.5">{fmtDate(c.ganhoEm)}</td>
                    <td className="py-1.5 text-right">
                      {c.pagoEm ? (
                        <button
                          onClick={() => alternar(c.id, false)}
                          disabled={pendente}
                          className="text-xs text-green-600 underline-offset-2 hover:underline"
                          title="Desfazer — se foi marcado por engano"
                        >
                          pago em {fmtDate(c.pagoEm)}
                        </button>
                      ) : (
                        <Button
                          size="sm" variant="outline" disabled={pendente}
                          onClick={() => alternar(c.id, true)}
                        >
                          Marcar como pago
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
