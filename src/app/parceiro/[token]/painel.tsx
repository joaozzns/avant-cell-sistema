"use client";

import { useState } from "react";
import { brl, fmtDate } from "@/lib/format";
import { SITUACAO_ASSINATURA } from "@/lib/parceiros";

type Dados = {
  representante: string;
  principal: boolean;
  carteira: { ativas: number; mrr: number; novas_no_mes: number };
  comissao: { definido: boolean; texto: string; mes?: number };
  lojas: { loja: string | null; nome: string; plano: string | null; valor: number; situacao: string; desde: string }[];
};

export function PainelRepresentante({ dados, convite }: { dados: Dados; convite: string }) {
  const [copiado, setCopiado] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}${convite}` : convite;

  const ativas = dados.lojas.filter((l) => l.situacao === "active");
  const outras = dados.lojas.filter((l) => l.situacao !== "active");

  return (
    <main className="min-h-dvh bg-slate-50 pb-10 dark:bg-slate-950">
      <section className="bg-slate-900 px-5 pb-8 pt-8 text-white">
        <div className="mx-auto max-w-lg">
          <p className="text-xs uppercase tracking-wide text-white/60">Avant Cell · sua carteira</p>
          <h1 className="mt-1 text-2xl font-bold">
            {dados.representante}
            {dados.principal && (
              <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 align-middle text-xs font-medium">
                principal
              </span>
            )}
          </h1>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/10 p-4">
              <p className="text-xs text-white/60">Lojas pagando</p>
              <p className="text-3xl font-bold">{dados.carteira.ativas}</p>
              {dados.carteira.novas_no_mes > 0 && (
                <p className="text-xs text-emerald-300">+{dados.carteira.novas_no_mes} neste mês</p>
              )}
            </div>
            <div className="rounded-xl bg-white/10 p-4">
              <p className="text-xs text-white/60">Elas pagam por mês</p>
              <p className="text-2xl font-bold">{brl(dados.carteira.mrr)}</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-white/10 p-4">
            <p className="text-xs text-white/60">Sua comissão</p>
            {dados.comissao.definido ? (
              <>
                <p className="text-2xl font-bold">{brl(dados.comissao.mes ?? 0)}</p>
                <p className="text-xs text-white/60">{dados.comissao.texto}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-white/70">{dados.comissao.texto}</p>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-lg gap-4 px-5 py-6">
        <div className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-semibold">Seu link de convite</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A loja que se cadastrar por este link entra como venda sua, automaticamente.
          </p>
          <code className="mt-2 block truncate rounded bg-muted px-2 py-1.5 text-xs">{link}</code>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button"
              onClick={() => { navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              {copiado ? "Copiado!" : "Copiar link"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Conheça o Avant Cell, o sistema para lojas de celular: ${link}`)}`}
              target="_blank" rel="noreferrer"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              Enviar no WhatsApp
            </a>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-semibold">Lojas pagando ({ativas.length})</h2>
          <div className="mt-3 grid gap-1.5 text-sm">
            {ativas.length === 0 && (
              <p className="text-muted-foreground">Nenhuma loja assinante ainda.</p>
            )}
            {ativas.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{l.loja || l.nome}</span>
                {l.plano && <span className="text-xs text-muted-foreground">{l.plano}</span>}
                <span className="text-xs text-muted-foreground">desde {fmtDate(l.desde)}</span>
                <strong>{brl(l.valor)}</strong>
              </div>
            ))}
          </div>
        </div>

        {outras.length > 0 && (
          <div className="rounded-xl border bg-background p-4">
            <h2 className="text-sm font-semibold">Em teste, atraso ou canceladas</h2>
            <div className="mt-3 grid gap-1.5 text-sm">
              {outras.map((l, i) => {
                const s = SITUACAO_ASSINATURA[l.situacao] ?? { rotulo: l.situacao };
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{l.loja || l.nome}</span>
                    <span className="text-xs text-muted-foreground">{s.rotulo}</span>
                    <span className="text-xs text-muted-foreground">desde {fmtDate(l.desde)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Página pessoal — não compartilhe este link.
        </p>
      </div>
    </main>
  );
}
