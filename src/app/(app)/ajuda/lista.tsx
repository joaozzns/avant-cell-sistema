"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { ARTIGOS, MODULOS, procurar } from "@/lib/ajuda";

export function ListaDeArtigos() {
  const [termo, setTermo] = useState("");
  const achados = useMemo(() => procurar(termo), [termo]);
  const buscando = termo.trim().length > 0;

  return (
    <div className="grid gap-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="O que você precisa fazer? Ex.: fechar o caixa, devolver venda, IMEI…"
          aria-label="Buscar na ajuda"
          autoFocus
          className="h-14 w-full rounded-2xl border bg-card pl-12 pr-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      {buscando && (
        <p className="text-sm text-muted-foreground">
          {achados.length === 0
            ? "Nada encontrado. Tente outra palavra — ou fale com o suporte."
            : `${achados.length} artigo(s) para “${termo.trim()}”.`}
        </p>
      )}

      {buscando ? (
        <div className="grid gap-2">
          {achados.map((a) => <Cartao key={a.slug} slug={a.slug} titulo={a.titulo} resumo={a.resumo} modulo={a.modulo} />)}
        </div>
      ) : (
        MODULOS.map((m) => {
          const doModulo = ARTIGOS.filter((a) => a.modulo === m);
          if (!doModulo.length) return null;
          return (
            <section key={m} className="grid gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{m}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {doModulo.map((a) => <Cartao key={a.slug} slug={a.slug} titulo={a.titulo} resumo={a.resumo} />)}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function Cartao({ slug, titulo, resumo, modulo }:
  { slug: string; titulo: string; resumo: string; modulo?: string }) {
  return (
    <Link
      href={`/ajuda/${slug}`}
      className="group flex items-start justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary"
    >
      <span className="min-w-0">
        {modulo && <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{modulo}</span>}
        <span className="block font-medium leading-snug group-hover:text-primary">{titulo}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{resumo}</span>
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
