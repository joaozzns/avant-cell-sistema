import { Lightbulb } from "lucide-react";
import type { Bloco } from "@/lib/ajuda";

/** Desenha o corpo de um artigo. Os tipos de bloco são poucos de propósito:
 *  manual que aceita qualquer formatação vira manual desformatado. */
export function Corpo({ blocos }: { blocos: Bloco[] }) {
  return (
    <div className="grid gap-4">
      {blocos.map((b, i) => {
        if (b.tipo === "texto")
          return <p key={i} className="text-[15px] leading-relaxed text-foreground/90">{b.conteudo}</p>;

        if (b.tipo === "passos")
          return (
            <ol key={i} className="grid gap-2.5">
              {b.itens.map((t, n) => (
                <li key={n} className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {n + 1}
                  </span>
                  <span className="text-foreground/90">{t}</span>
                </li>
              ))}
            </ol>
          );

        if (b.tipo === "lista")
          return (
            <ul key={i} className="grid gap-2">
              {b.itens.map((t, n) => (
                <li key={n} className="flex gap-2.5 text-[15px] leading-relaxed text-foreground/90">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  {t}
                </li>
              ))}
            </ul>
          );

        if (b.tipo === "atalhos")
          return (
            <div key={i} className="grid gap-1.5 rounded-xl border bg-muted/30 p-4">
              {b.itens.map((a, n) => (
                <div key={n} className="flex items-center gap-3 text-sm">
                  <kbd className="min-w-[42px] rounded-md border border-b-2 bg-background px-2 py-1 text-center font-mono text-xs font-semibold">
                    {a.tecla}
                  </kbd>
                  <span className="text-foreground/90">{a.faz}</span>
                </div>
              ))}
            </div>
          );

        return (
          <div key={i} className="flex gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
            <Lightbulb className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
            <p className="text-[15px] leading-relaxed text-foreground/90">{b.conteudo}</p>
          </div>
        );
      })}
    </div>
  );
}
