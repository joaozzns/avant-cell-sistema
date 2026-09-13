"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingCart, Package, Wrench, Users, Wallet,
  FileText, BarChart3, Settings, Globe, ChevronRight, Search, Moon, Sun, Upload,
} from "lucide-react";

type Item = { href: string; label: string };
type Modulo = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  itens?: Item[];
  etiqueta?: string;
};

/* A arvore espelha as rotas que existem de fato — nenhum item leva a lugar nenhum. */
const MODULOS: Modulo[] = [
  { href: "/dashboard", label: "Tela inicial", icon: LayoutDashboard },
  {
    href: "/pdv", label: "Vendas", icon: ShoppingCart,
    itens: [
      { href: "/pdv", label: "PDV" },
      { href: "/pdv/vendas", label: "Vendas realizadas" },
      { href: "/pdv/caixa", label: "Caixa" },
    ],
  },
  {
    href: "/estoque", label: "Compras / Estoque", icon: Package,
    itens: [
      { href: "/estoque", label: "Catálogo" },
      { href: "/estoque/aparelhos", label: "Aparelhos (IMEI)" },
      { href: "/estoque/categorias", label: "Categorias" },
      { href: "/estoque/movimentacoes", label: "Movimentações" },
      { href: "/compras", label: "Pedidos de compra" },
      { href: "/compras/fornecedores", label: "Fornecedores" },
    ],
  },
  {
    href: "/os", label: "Ordem de Serviço", icon: Wrench,
    itens: [
      { href: "/os", label: "Painel de OS" },
      { href: "/os/nova", label: "Nova OS" },
    ],
  },
  { href: "/clientes", label: "Clientes", icon: Users },
  {
    href: "/financeiro", label: "Financeiro", icon: Wallet,
    itens: [
      { href: "/financeiro", label: "Visão geral" },
      { href: "/financeiro/receber", label: "Contas a receber" },
      { href: "/financeiro/pagar", label: "Contas a pagar" },
      { href: "/financeiro/dre", label: "DRE" },
    ],
  },
  {
    href: "/fiscal", label: "Fiscal", icon: FileText,
    itens: [
      { href: "/fiscal", label: "Monitor de notas" },
      { href: "/fiscal/configuracoes", label: "Configurações" },
    ],
  },
  {
    href: "/relatorios", label: "Relatórios", icon: BarChart3, etiqueta: "Novo",
    itens: [
      { href: "/relatorios", label: "Central" },
      { href: "/relatorios/vendas", label: "Vendas" },
      { href: "/relatorios/assistencia", label: "Assistência" },
      { href: "/relatorios/estoque", label: "Estoque" },
    ],
  },
  {
    href: "/admin", label: "Administração", icon: Settings,
    itens: [
      { href: "/admin", label: "Usuários e lojas" },
      { href: "/admin/auditoria", label: "Auditoria" },
    ],
  },
  { href: "/importar", label: "Importar dados", icon: Upload },
  { href: "/portal", label: "Portal do cliente", icon: Globe },
];

function ativo(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  nome,
  email,
  plano,
  onNavegar,
}: {
  nome: string;
  email: string;
  plano?: string;
  onNavegar?: () => void;
}) {
  const pathname = usePathname();
  const [abertos, setAbertos] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [escuro, setEscuro] = useState(false);

  /* o modulo da rota atual ja abre expandido */
  useEffect(() => {
    const atual = MODULOS.find((m) => m.itens && ativo(pathname, m.href));
    if (atual) setAbertos((a) => (a.includes(atual.href) ? a : [...a, atual.href]));
  }, [pathname]);

  useEffect(() => {
    let salvo = false;
    try {
      salvo = localStorage.getItem("avc-tema") === "dark";
    } catch {
      /* navegacao privada bloqueia a leitura: fica no tema claro */
    }
    setEscuro(salvo);
    document.documentElement.classList.toggle("dark", salvo);
  }, []);

  function alternarTema() {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.classList.toggle("dark", novo);
    try {
      localStorage.setItem("avc-tema", novo ? "dark" : "light");
    } catch {
      /* sem persistencia, mas o tema vale para a sessao */
    }
  }

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? MODULOS.filter(
        (m) =>
          m.label.toLowerCase().includes(termo) ||
          m.itens?.some((i) => i.label.toLowerCase().includes(termo))
      )
    : MODULOS;

  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r bg-sidebar">
      {/* marca: o fundo acompanha o tema da barra lateral; a versao da logo troca
          por CSS (dark:), sem depender do estado do React, entao nao pisca na carga */}
      <div className="flex h-[70px] shrink-0 items-center border-b bg-sidebar px-5">
        <Image
          src="/logo-cor.svg"
          alt="Avant Cell"
          width={199}
          height={48}
          priority
          className="h-12 w-auto dark:hidden"
        />
        <Image
          src="/logo-branca.svg"
          alt="Avant Cell"
          width={199}
          height={48}
          priority
          className="hidden h-12 w-auto dark:block"
        />
      </div>

      {/* usuario */}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          {iniciais || "AC"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{nome}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      {/* busca */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar módulo"
            aria-label="Buscar módulo"
            className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
          />
        </div>
      </div>

      {/* navegacao */}
      <nav className="flex-1 overflow-y-auto p-3">
        {visiveis.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhum módulo encontrado.
          </p>
        )}
        <ul className="grid gap-1">
          {visiveis.map(({ href, label, icon: Icon, itens, etiqueta }) => {
            const emUso = ativo(pathname, href);
            const aberto = abertos.includes(href) || Boolean(termo);
            return (
              <li key={href}>
                <div className="flex items-stretch">
                  <Link
                    href={href}
                    onClick={onNavegar}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      emUso
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{label}</span>
                    {etiqueta && (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          emUso ? "bg-white/25 text-white" : "bg-success/15 text-success"
                        )}
                      >
                        {etiqueta}
                      </span>
                    )}
                  </Link>
                  {itens && (
                    <button
                      type="button"
                      onClick={() =>
                        setAbertos((a) =>
                          a.includes(href) ? a.filter((x) => x !== href) : [...a, href]
                        )
                      }
                      aria-expanded={aberto}
                      aria-label={`${aberto ? "Recolher" : "Expandir"} ${label}`}
                      className={cn(
                        "ml-1 rounded-lg px-2 transition-colors",
                        emUso
                          ? "text-sidebar-primary-foreground hover:bg-white/15"
                          : "text-muted-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          aberto && "rotate-90"
                        )}
                      />
                    </button>
                  )}
                </div>

                {itens && aberto && (
                  <ul className="ml-5 mt-1 grid gap-0.5 border-l pl-4">
                    {itens.map((i) => {
                      const sub = pathname === i.href;
                      return (
                        <li key={i.href}>
                          <Link
                            href={i.href}
                            onClick={onNavegar}
                            className={cn(
                              "block rounded-md px-3 py-1.5 text-[13px] transition-colors",
                              sub
                                ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                          >
                            {i.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* rodape */}
      <div className="shrink-0 border-t px-5 py-4">
        <button
          type="button"
          onClick={alternarTema}
          className="mb-3 flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              escuro ? "bg-primary" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                escuro ? "left-[18px]" : "left-0.5"
              )}
            />
          </span>
          {escuro ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          {escuro ? "Tema escuro" : "Tema claro"}
        </button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Avant Cell · versão 1.0.0
          {plano ? (
            <>
              <br />
              Plano: {plano}
            </>
          ) : null}
        </p>
      </div>
    </aside>
  );
}
