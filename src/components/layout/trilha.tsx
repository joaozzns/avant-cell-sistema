"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

/* Nome de cada segmento de rota. O que nao estiver aqui e um id (detalhe de
   venda, OS, pedido, produto, cliente) — nesses casos a propria tela ja mostra
   o identificador no titulo, entao a trilha diz so "Detalhe". */
const NOMES: Record<string, string> = {
  dashboard: "Dashboard diário",
  pdv: "PDV e vendas",
  vendas: "Vendas realizadas",
  caixa: "Caixa",
  reservas: "Reservas e encomendas",
  estoque: "Catálogo e estoque",
  aparelhos: "Aparelhos (IMEI)",
  usado: "Usado na troca",
  comissoes: "Comissão e metas",
  transferencias: "Transferências",
  inventario: "Inventário",
  conciliacao: "Conciliação de cartão",
  nova: "Nova",
  categorias: "Categorias e marcas",
  movimentacoes: "Movimentações",
  novo: "Novo",
  compras: "Compras",
  fornecedores: "Fornecedores",
  os: "Assistência técnica",
  laboratorio: "Laboratório externo",
  clientes: "Clientes",
  avisos: "Avisos ao cliente",
  modelos: "Modelos de mensagem",
  financeiro: "Financeiro",
  receber: "Contas a receber",
  pagar: "Contas a pagar",
  dre: "DRE gerencial",
  fiscal: "Fiscal",
  configuracoes: "Configurações",
  relatorios: "Relatórios",
  assistencia: "Assistência",
  admin: "Administração",
  auditoria: "Auditoria",
  portal: "Portal do cliente",
  importar: "Importar dados",
  devolver: "Devolução / troca",
};

/* Rotas que existem como pagina — as demais viram texto sem link, para a trilha
   nunca oferecer um caminho que devolve 404. */
const NAVEGAVEIS = new Set([
  "/dashboard", "/pdv", "/pdv/vendas", "/pdv/caixa",
  "/estoque", "/estoque/aparelhos", "/estoque/categorias", "/estoque/movimentacoes",
  "/estoque/novo", "/compras", "/compras/fornecedores", "/compras/novo",
  "/os", "/os/nova", "/clientes", "/clientes/novo",
  "/clientes/avisos", "/clientes/modelos", "/os/laboratorio", "/pdv/reservas",
  "/estoque/usado", "/estoque/transferencias", "/estoque/inventario",
  "/financeiro/comissoes", "/financeiro/conciliacao",
  "/financeiro", "/financeiro/receber", "/financeiro/pagar", "/financeiro/dre",
  "/fiscal", "/fiscal/configuracoes",
  "/relatorios", "/relatorios/vendas", "/relatorios/assistencia", "/relatorios/estoque",
  "/admin", "/admin/auditoria", "/portal", "/importar",
]);

export function Trilha() {
  const pathname = usePathname();
  const partes = pathname.split("/").filter(Boolean);
  if (partes.length === 0 || partes[0] === "dashboard") {
    /* na tela inicial a trilha seria só "Tela inicial": mostramos o destino */
    return (
      <Migalhas
        itens={[{ label: "Dashboard diário", href: undefined }]}
      />
    );
  }

  const itens = partes.map((seg, i) => {
    const href = "/" + partes.slice(0, i + 1).join("/");
    const ultimo = i === partes.length - 1;
    return {
      label: NOMES[seg] ?? "Detalhe",
      href: ultimo || !NAVEGAVEIS.has(href) ? undefined : href,
    };
  });

  return <Migalhas itens={itens} />;
}

function Migalhas({ itens }: { itens: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Você está aqui" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 transition-colors hover:text-primary"
          >
            <Home className="h-4 w-4" />
            Tela inicial
          </Link>
        </li>
        {itens.map((p, i) => (
          <li key={`${p.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            {p.href ? (
              <Link href={p.href} className="transition-colors hover:text-primary">
                {p.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{p.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
