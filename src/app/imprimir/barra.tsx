"use client";

import { useEffect } from "react";

/* Barra de ações da página de impressão. Abre a janela de impressão sozinha
   uma vez, quando a página termina de carregar. */
export function BarraImpressao({
  voltar,
  opcoes,
}: {
  voltar: string;
  opcoes?: { rotulo: string; href: string; ativo: boolean }[];
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="barra-impressao">
      <a href={voltar}>← Voltar</a>
      {opcoes?.map((o) => (
        <a key={o.href} href={o.href} className={o.ativo ? "ativo" : ""}>{o.rotulo}</a>
      ))}
      <button type="button" className="principal" onClick={() => window.print()}>Imprimir</button>
    </div>
  );
}
