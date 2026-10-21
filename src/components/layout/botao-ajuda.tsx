"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { artigoDaTela } from "@/lib/ajuda";

/** O "?" do topo.
 *
 *  Antes ele levava para a página de contato do site — ou seja, o atalho mais
 *  visível do sistema convidava a abrir chamado. Agora abre o artigo da tela
 *  onde a pessoa está; só quando não existe artigo para aquela rota é que cai
 *  no índice da ajuda. */
export function BotaoAjuda() {
  const caminho = usePathname();
  const artigo = artigoDaTela(caminho);
  const destino = artigo ? `/ajuda/${artigo.slug}` : "/ajuda";

  return (
    <Link
      href={destino}
      aria-label={artigo ? `Ajuda: ${artigo.titulo}` : "Ajuda"}
      title={artigo ? `Ajuda: ${artigo.titulo}` : "Central de ajuda"}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <CircleHelp className="h-5 w-5" />
    </Link>
  );
}
