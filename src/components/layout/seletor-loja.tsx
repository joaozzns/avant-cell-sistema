"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Store } from "lucide-react";
import { trocarLoja } from "@/app/(app)/loja-actions";

/** Quem cuida de duas lojas precisa dizer em qual está: caixa, estoque e OS
 *  são da loja ativa, e trabalhar na loja errada é o tipo de engano que só
 *  aparece no fechamento. */
export function SeletorLoja({
  lojas, atual,
}: {
  lojas: { id: string; nome: string }[];
  atual: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  const nomeAtual = lojas.find((l) => l.id === atual)?.nome ?? "Loja";
  if (lojas.length <= 1) {
    return (
      <div className="hidden items-center gap-2 rounded-lg border bg-background px-3 py-2 sm:flex">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="max-w-[200px] truncate text-sm font-medium">{nomeAtual}</span>
      </div>
    );
  }

  function trocar(id: string) {
    setAberto(false);
    iniciar(async () => {
      const r = await trocarLoja(id);
      if (!r.error) router.refresh();
    });
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setAberto((a) => !a)} disabled={pendente}
        className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 transition-colors hover:border-primary">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="max-w-[160px] truncate text-sm font-medium">
          {pendente ? "Trocando…" : nomeAtual}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {aberto && (
        <>
          <button type="button" aria-label="Fechar" onClick={() => setAberto(false)}
            className="fixed inset-0 z-30 cursor-default" />
          <div className="absolute right-0 z-40 mt-1 w-60 rounded-lg border bg-card p-1 shadow-lg">
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Caixa, estoque e OS são da loja ativa.
            </p>
            {lojas.map((l) => (
              <button key={l.id} type="button" onClick={() => trocar(l.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${l.id === atual ? "font-medium" : ""}`}>
                <Check className={`h-4 w-4 ${l.id === atual ? "opacity-100" : "opacity-0"}`} />
                <span className="truncate">{l.nome}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
