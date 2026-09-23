"use client";

import { brl, fmtDate } from "@/lib/format";

type Dados = {
  vendedor: string;
  empresa: string;
  principal: boolean;
  periodo: string;
  mes: { vendas: number; total: number; ticket: number };
  hoje: { vendas: number; total: number };
  comissao: { a_apurar: number; aprovada: number; paga: number; estornos: number; total: number };
  meta: { alvo: number; bonus: number; atingido: number | null };
  posicao: number | null;
  ranking: { posicao: number; nome: string; eu: boolean; total: number; vendas: number }[];
  ultimas: { numero: number; data: string; total: number; cliente: string }[];
  loja: { vendas_mes: number; qtd_mes: number; comissao_mes: number } | null;
};

const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Anel da meta: o número que o vendedor olha primeiro. */
function Anel({ pct }: { pct: number }) {
  const raio = 52;
  const volta = 2 * Math.PI * raio;
  const cheio = Math.min(pct, 100) / 100;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle cx="60" cy="60" r={raio} fill="none" strokeWidth="12"
        className="stroke-white/15" />
      <circle cx="60" cy="60" r={raio} fill="none" strokeWidth="12" strokeLinecap="round"
        className={pct >= 100 ? "stroke-emerald-400" : "stroke-white"}
        strokeDasharray={`${volta * cheio} ${volta}`} />
    </svg>
  );
}

export function PainelVendedor({ dados }: { dados: Dados }) {
  const [ano, mes] = dados.periodo.split("-");
  const nomeMes = `${MES[Number(mes) - 1]} de ${ano}`;
  const pct = dados.meta.atingido ?? 0;
  const faltaMeta = Math.max(dados.meta.alvo - dados.mes.total, 0);

  return (
    <main className="min-h-dvh bg-slate-50 pb-10 dark:bg-slate-950">
      {/* topo escuro com o essencial */}
      <section className="bg-slate-900 px-5 pb-8 pt-8 text-white dark:bg-slate-900">
        <div className="mx-auto max-w-lg">
          <p className="text-xs uppercase tracking-wide text-white/60">
            {dados.empresa} · {nomeMes}
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            {dados.vendedor}
            {dados.principal && (
              <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 align-middle text-xs font-medium">
                vendedor principal
              </span>
            )}
          </h1>

          <div className="mt-6 flex items-center gap-5">
            <div className="relative shrink-0">
              <Anel pct={pct} />
              <div className="absolute inset-0 grid place-content-center text-center">
                <span className="text-2xl font-bold">
                  {dados.meta.alvo > 0 ? `${Math.round(pct)}%` : "—"}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-white/60">da meta</span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/60">Você vendeu neste mês</p>
              <p className="truncate text-3xl font-bold">{brl(dados.mes.total)}</p>
              <p className="mt-1 text-sm text-white/70">
                {dados.mes.vendas} venda(s) · ticket médio {brl(dados.mes.ticket)}
              </p>
              {dados.meta.alvo > 0 && (
                <p className="mt-2 text-sm text-white/80">
                  {faltaMeta > 0
                    ? <>faltam <strong>{brl(faltaMeta)}</strong> para bater a meta</>
                    : <>meta batida{dados.meta.bonus > 0 && <> · bônus de {brl(dados.meta.bonus)}</>}</>}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-xs text-white/60">Hoje</p>
              <p className="text-lg font-bold">{brl(dados.hoje.total)}</p>
              <p className="text-xs text-white/60">{dados.hoje.vendas} venda(s)</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-xs text-white/60">
                {dados.principal ? "Comissão da equipe" : "Sua comissão no mês"}
              </p>
              <p className="text-lg font-bold">
                {brl(dados.principal ? (dados.loja?.comissao_mes ?? 0) : dados.comissao.total)}
              </p>
              <p className="text-xs text-white/60">
                {dados.principal ? "a pagar aos vendedores" : `${dados.posicao ? `${dados.posicao}º no ranking` : "sem ranking"}`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-lg gap-4 px-5 py-6">
        {dados.principal && dados.loja && (
          <div className="rounded-xl border bg-background p-4">
            <h2 className="text-sm font-semibold">A loja neste mês</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Faturamento</p>
                <p className="text-lg font-bold">{brl(dados.loja.vendas_mes)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Vendas</p>
                <p className="text-lg font-bold">{dados.loja.qtd_mes}</p>
              </div>
            </div>
          </div>
        )}

        {!dados.principal && (
          <div className="rounded-xl border bg-background p-4">
            <h2 className="text-sm font-semibold">Sua comissão</h2>
            <dl className="mt-3 grid gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">A apurar</dt>
                <dd>{brl(dados.comissao.a_apurar)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Aprovada</dt>
                <dd>{brl(dados.comissao.aprovada)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Já paga</dt>
                <dd>{brl(dados.comissao.paga)}</dd>
              </div>
              {dados.comissao.estornos < 0 && (
                <div className="flex justify-between text-destructive">
                  <dt>Estorno por devolução</dt>
                  <dd>{brl(dados.comissao.estornos)}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
                <dt>Total do mês</dt>
                <dd>{brl(dados.comissao.total)}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-semibold">Ranking do mês</h2>
          <div className="mt-3 grid gap-1.5">
            {dados.ranking.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma venda no mês ainda.</p>
            )}
            {dados.ranking.map((r) => (
              <div key={r.posicao}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${r.eu ? "border-primary bg-primary/5 font-medium" : ""}`}>
                <span className="w-6 text-center text-muted-foreground">{r.posicao}º</span>
                <span className="min-w-0 flex-1 truncate">{r.nome}{r.eu && " (você)"}</span>
                <span className="text-xs text-muted-foreground">{r.vendas} venda(s)</span>
                <strong>{brl(r.total)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-semibold">Suas últimas vendas</h2>
          <div className="mt-3 grid gap-1.5 text-sm">
            {dados.ultimas.length === 0 && (
              <p className="text-muted-foreground">Nada registrado ainda.</p>
            )}
            {dados.ultimas.map((v) => (
              <div key={v.numero} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <span className="text-muted-foreground">#{v.numero}</span>
                <span className="min-w-0 flex-1 truncate">{v.cliente}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(v.data)}</span>
                <strong>{brl(v.total)}</strong>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Página pessoal — não compartilhe este link. Os números são da loja {dados.empresa}.
        </p>
      </div>
    </main>
  );
}
