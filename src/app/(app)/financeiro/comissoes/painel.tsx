"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { alternarRegra, apurarComissao, mudarSituacao, salvarMeta, salvarRegra } from "./actions";

export type LinhaVendedor = {
  id: string; nome: string; vendido: number; comissao: number;
  emAberto: number; aprovado: number; pago: number; meta: number; bonus: number;
};
export type Regra = {
  id: string; name: string; base: string; rate: number | null;
  fixed_amount: number | null; only_when_paid: boolean; active: boolean;
};

const BASES: Record<string, string> = {
  sale: "% da venda",
  margin: "% da margem",
  fixed_per_os: "valor fixo por OS entregue",
};

export function PainelComissoes({
  periodo, linhas, regras, equipe,
}: {
  periodo: string;
  linhas: LinhaVendedor[];
  regras: Regra[];
  equipe: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const [nome, setNome] = useState("");
  const [base, setBase] = useState("sale");
  const [taxa, setTaxa] = useState("");
  const [fixo, setFixo] = useState("");
  const [soPago, setSoPago] = useState(true);

  const [metaPessoa, setMetaPessoa] = useState(equipe[0]?.id ?? "");
  const [metaAlvo, setMetaAlvo] = useState("");
  const [metaBonus, setMetaBonus] = useState("");

  const totais = linhas.reduce(
    (s, l) => ({
      vendido: s.vendido + l.vendido, comissao: s.comissao + l.comissao,
      emAberto: s.emAberto + l.emAberto, aprovado: s.aprovado + l.aprovado, pago: s.pago + l.pago,
    }),
    { vendido: 0, comissao: 0, emAberto: 0, aprovado: 0, pago: 0 },
  );

  function numero(v: string) {
    return Number(v.replace(/\./g, "").replace(",", ".")) || 0;
  }

  function trocarPeriodo(novo: string) {
    router.push(`/financeiro/comissoes?periodo=${novo}`);
  }

  function apurar() {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await apurarComissao(periodo);
      if (r.error) { setErro(r.error); return; }
      setAviso(`${r.lancamentos} lançamento(s) apurados, somando ${brl(r.total ?? 0)}.`);
      router.refresh();
    });
  }

  function situacao(usuario: string | null, novo: string) {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await mudarSituacao(periodo, usuario, novo);
      if (r.error) { setErro(r.error); return; }
      setAviso(`${r.atualizados} lançamento(s) atualizados.`);
      router.refresh();
    });
  }

  function criarRegra() {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await salvarRegra({ nome, base, taxa: numero(taxa), fixo: numero(fixo), soQuandoPago: soPago });
      if (r.error) { setErro(r.error); return; }
      setNome(""); setTaxa(""); setFixo("");
      router.refresh();
    });
  }

  function definirMeta() {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await salvarMeta(periodo, metaPessoa, numero(metaAlvo), numero(metaBonus));
      if (r.error) { setErro(r.error); return; }
      setMetaAlvo(""); setMetaBonus("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comissão e metas</h1>
          <p className="text-sm text-muted-foreground">
            Item devolvido sai da base, e venda no crediário só entra conforme o cliente paga.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="periodo">Mês</Label>
            <Input id="periodo" type="month" value={periodo}
              onChange={(e) => trocarPeriodo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={apurar} disabled={pendente}>
            {pendente ? "Apurando…" : "Apurar comissão"}
          </Button>
        </div>
      </div>

      {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Vendido no mês", totais.vendido],
          ["Comissão apurada", totais.comissao],
          ["Aguardando aprovação", totais.emAberto],
          ["Aprovada a pagar", totais.aprovado],
        ].map(([rotulo, valor]) => (
          <div key={String(rotulo)} className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p className="mt-1 text-xl font-bold">{brl(Number(valor))}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Por vendedor</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda neste mês. Escolha outro mês ou registre vendas no PDV.
            </p>
          ) : (
            <div className="grid gap-3">
              {linhas.map((l) => {
                const pct = l.meta > 0 ? Math.min(100, Math.round((l.vendido / l.meta) * 100)) : 0;
                return (
                  <div key={l.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{l.nome}</span>
                      <span className="text-sm">
                        vendeu <strong>{brl(l.vendido)}</strong> · comissão <strong>{brl(l.comissao)}</strong>
                      </span>
                    </div>

                    {l.meta > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Meta {brl(l.meta)}{l.bonus > 0 && ` · bônus ${brl(l.bonus)}`}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${pct >= 100 ? "bg-green-600" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>em aberto {brl(l.emAberto)}</span>
                      <span>aprovada {brl(l.aprovado)}</span>
                      <span>paga {brl(l.pago)}</span>
                      <span className="ml-auto flex gap-2">
                        {l.emAberto > 0 && (
                          <Button size="sm" variant="outline" disabled={pendente}
                            onClick={() => situacao(l.id, "approved")}>Aprovar</Button>
                        )}
                        {l.aprovado > 0 && (
                          <Button size="sm" disabled={pendente}
                            onClick={() => situacao(l.id, "paid")}>Marcar como paga</Button>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Regras de comissão</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4">
            {regras.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma regra ainda. Sem regra, a apuração não gera nada.
              </p>
            )}
            {regras.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>
                  <strong>{r.name}</strong> · {BASES[r.base] ?? r.base}{" "}
                  {r.base === "fixed_per_os" ? brl(Number(r.fixed_amount)) : `${Number(r.rate)}%`}
                  {r.only_when_paid && <span className="block text-xs text-muted-foreground">só quando o cliente pagar</span>}
                </span>
                <Button size="sm" variant="outline" disabled={pendente}
                  onClick={() => iniciar(async () => { await alternarRegra(r.id, !r.active); router.refresh(); })}>
                  {r.active ? "Desativar" : "Ativar"}
                </Button>
              </div>
            ))}

            <div className="grid gap-2 rounded-lg border border-dashed p-3">
              <Input placeholder="Nome da regra (ex.: Vendedor — acessórios)" value={nome} onChange={(e) => setNome(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {Object.entries(BASES).map(([valor, rotulo]) => (
                  <button key={valor} type="button" onClick={() => setBase(valor)}
                    className={`rounded-md border px-3 py-1.5 text-xs ${base === valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
              {base === "fixed_per_os" ? (
                <Input placeholder="Valor por OS (R$)" value={fixo} onChange={(e) => setFixo(e.target.value)} inputMode="decimal" />
              ) : (
                <Input placeholder="Percentual (ex.: 3)" value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={soPago} onChange={() => setSoPago(!soPago)} className="h-4 w-4" />
                Só quando o cliente pagar (crediário entra conforme recebe)
              </label>
              <Button onClick={criarRegra} disabled={pendente}>Adicionar regra</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Meta do mês</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-4">
            <select value={metaPessoa} onChange={(e) => setMetaPessoa(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm">
              {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <Input placeholder="Meta de venda (R$)" value={metaAlvo} onChange={(e) => setMetaAlvo(e.target.value)} inputMode="decimal" />
            <Input placeholder="Bônus ao bater a meta (opcional)" value={metaBonus} onChange={(e) => setMetaBonus(e.target.value)} inputMode="decimal" />
            <Button onClick={definirMeta} disabled={pendente || !metaPessoa}>Salvar meta</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
