"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { brl, fmtDate } from "@/lib/format";
import { lerCsv, numeroBR, dataISO, normalizar } from "@/lib/importacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { conciliar, contestar, importarExtrato, type LinhaExtrato } from "./actions";

export type Lancamento = {
  id: string; adquirente: string; bruto: number; taxa: number; liquido: number;
  previsto: string | null; situacao: string; autorizacao: string | null; bandeira: string | null;
};
type SemExtrato = { id: string; venda: number; data: string; valor: number; forma: string; parcelas: number };

const SITUACAO: Record<string, { rotulo: string; cor: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { rotulo: "sem conferir", cor: "outline" },
  matched: { rotulo: "conferido", cor: "default" },
  divergent: { rotulo: "taxa diferente", cor: "destructive" },
  contested: { rotulo: "em contestação", cor: "secondary" },
};

const FORMA: Record<string, string> = {
  debit: "Débito", credit: "Crédito à vista", credit_installments: "Crédito parcelado",
};

/* Cabeçalhos aceitos no extrato. Cada maquininha nomeia do seu jeito. */
const COLUNAS: Record<string, string[]> = {
  bruto: ["valor bruto", "bruto", "valor da venda", "valor", "vl bruto"],
  taxa: ["taxa", "desconto", "valor taxa", "custo", "comissao"],
  liquido: ["valor liquido", "liquido", "valor a receber", "vl liquido"],
  previsto: ["data prevista", "previsao de pagamento", "data pagamento", "data de pagamento", "vencimento"],
  recebido: ["data recebimento", "data credito", "data do credito"],
  autorizacao: ["autorizacao", "codigo autorizacao", "nsu", "codigo", "auth"],
  bandeira: ["bandeira", "produto", "modalidade"],
};

export function PainelConciliacao({
  lancamentos, semExtrato,
}: {
  lancamentos: Lancamento[]; semExtrato: SemExtrato[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [adquirente, setAdquirente] = useState("");

  const totais = useMemo(() => lancamentos.reduce(
    (s, l) => ({
      bruto: s.bruto + l.bruto, taxa: s.taxa + l.taxa, liquido: s.liquido + l.liquido,
      divergentes: s.divergentes + (l.situacao === "divergent" ? 1 : 0),
      pendentes: s.pendentes + (l.situacao === "pending" ? 1 : 0),
    }),
    { bruto: 0, taxa: 0, liquido: 0, divergentes: 0, pendentes: 0 },
  ), [lancamentos]);

  const taxaMedia = totais.bruto > 0 ? (totais.taxa / totais.bruto) * 100 : 0;

  async function enviarArquivo(arquivo: File) {
    setErro(""); setAviso("");
    try {
      const texto = await arquivo.text();
      const tabela = lerCsv(texto);
      if (tabela.length < 2) throw new Error("O arquivo não tem linhas de dados.");

      const cabecalho = tabela[0].map((c) => normalizar(c));
      const onde: Record<string, number> = {};
      for (const [campo, nomes] of Object.entries(COLUNAS)) {
        const i = cabecalho.findIndex((c) => nomes.some((n) => c.includes(normalizar(n))));
        if (i >= 0) onde[campo] = i;
      }
      if (onde.bruto === undefined) {
        throw new Error("Não achei a coluna de valor bruto. Cabeçalhos lidos: " + cabecalho.join(", "));
      }

      const linhas: LinhaExtrato[] = tabela.slice(1)
        .filter((l) => l.some((c) => String(c).trim() !== ""))
        .map((l) => {
          const bruto = numeroBR(l[onde.bruto]) ?? 0;
          const taxa = onde.taxa !== undefined ? (numeroBR(l[onde.taxa]) ?? 0) : 0;
          const liquido = onde.liquido !== undefined ? (numeroBR(l[onde.liquido]) ?? bruto - taxa) : bruto - taxa;
          return {
            adquirente: adquirente.trim() || arquivo.name.replace(/\.[^.]+$/, ""),
            bruto, taxa: Math.abs(taxa), liquido,
            previsto: onde.previsto !== undefined ? dataISO(l[onde.previsto]) : null,
            recebido: onde.recebido !== undefined ? dataISO(l[onde.recebido]) : null,
            autorizacao: onde.autorizacao !== undefined ? String(l[onde.autorizacao] ?? "").trim() || null : null,
            bandeira: onde.bandeira !== undefined ? String(l[onde.bandeira] ?? "").trim() || null : null,
          };
        })
        .filter((l) => l.bruto > 0);

      if (!linhas.length) throw new Error("Nenhuma linha com valor válido.");

      const lote = `${Date.now()}`;
      iniciar(async () => {
        const r = await importarExtrato(linhas, lote);
        if (r.error) { setErro(r.error); return; }
        const c = await conciliar(lote);
        if ("error" in c && c.error) { setErro(c.error); return; }
        const res = c as { casados: number; divergentes: number; sem_par: number };
        setAviso(`${r.importadas} lançamentos importados · ${res.casados} conferidos, ${res.divergentes} com taxa diferente, ${res.sem_par} sem venda correspondente.`);
        router.refresh();
      });
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conciliação de cartão</h1>
        <p className="text-sm text-muted-foreground">
          Importe o extrato da maquininha e veja o que ela pagou, o que ainda não pagou e onde a taxa
          cobrada é diferente da combinada.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Bruto no extrato", brl(totais.bruto)],
          ["Taxa cobrada", brl(totais.taxa)],
          ["Líquido a receber", brl(totais.liquido)],
          ["Taxa média", `${taxaMedia.toFixed(2)}%`],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="border-b py-4"><CardTitle className="text-base">Importar extrato</CardTitle></CardHeader>
        <CardContent className="grid gap-3 pt-4">
          <input
            className="h-9 rounded-md border bg-background px-3 text-sm"
            placeholder="Nome da maquininha (ex.: Cielo, Stone)"
            value={adquirente} onChange={(e) => setAdquirente(e.target.value)} />
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm font-medium hover:bg-muted">
            <Upload className="h-4 w-4" />
            {pendente ? "Processando…" : "Escolher arquivo CSV do extrato"}
            <input type="file" accept=".csv,text/csv" hidden
              onChange={(e) => e.target.files?.[0] && enviarArquivo(e.target.files[0])} />
          </label>
          <p className="text-xs text-muted-foreground">
            Aceita o CSV exportado pela maquininha. Procuro as colunas de valor bruto, taxa, líquido,
            data prevista e código de autorização — cada operadora nomeia do seu jeito.
          </p>
          {aviso && <p className="rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{aviso}</p>}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </CardContent>
      </Card>

      {semExtrato.length > 0 && (
        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Vendas no cartão sem pagamento no extrato ({semExtrato.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ou a maquininha ainda não repassou, ou o extrato desse período não foi importado.
            </p>
          </CardHeader>
          <CardContent className="grid gap-1.5 pt-4 text-sm">
            {semExtrato.slice(0, 12).map((v) => (
              <div key={v.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-2.5">
                <span>
                  Venda #{v.venda}
                  <span className="block text-xs text-muted-foreground">
                    {FORMA[v.forma] ?? v.forma}{v.parcelas > 1 && ` em ${v.parcelas}x`} · {fmtDate(v.data)}
                  </span>
                </span>
                <strong>{brl(v.valor)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Extrato importado</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-4 text-sm">
          {lancamentos.length === 0 && (
            <p className="text-muted-foreground">Nenhum extrato importado ainda.</p>
          )}
          {lancamentos.map((l) => {
            const s = SITUACAO[l.situacao] ?? { rotulo: l.situacao, cor: "outline" as const };
            const taxaPct = l.bruto > 0 ? (l.taxa / l.bruto) * 100 : 0;
            return (
              <div key={l.id} className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 ${l.situacao === "divergent" ? "border-destructive/40" : ""}`}>
                <span className="min-w-0 flex-1">
                  {l.adquirente}{l.bandeira && ` · ${l.bandeira}`}
                  <span className="block text-xs text-muted-foreground">
                    {l.previsto ? `previsto ${fmtDate(l.previsto)}` : "sem data"}
                    {l.autorizacao && ` · autorização ${l.autorizacao}`}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  bruto {brl(l.bruto)} · taxa {brl(l.taxa)} ({taxaPct.toFixed(2)}%)
                </span>
                <strong>{brl(l.liquido)}</strong>
                <Badge variant={s.cor}>{s.rotulo}</Badge>
                {l.situacao === "divergent" && (
                  <Button size="sm" variant="outline" disabled={pendente}
                    onClick={() => iniciar(async () => { await contestar(l.id); router.refresh(); })}>
                    Contestar
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
