"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingCart, Package, Wrench, Users, Truck,
  Wallet, FileText, BarChart3, Settings, Globe, KeyRound,
} from "lucide-react";

const MODULES = [
  { href: "/dashboard",   label: "Dashboard",      icon: LayoutDashboard },
  { href: "/pdv",         label: "PDV e vendas",   icon: ShoppingCart },
  { href: "/estoque",     label: "Catálogo e estoque", icon: Package },
  { href: "/os",          label: "Assistência (OS)",   icon: Wrench },
  { href: "/clientes",    label: "Clientes e CRM", icon: Users },
  { href: "/compras",     label: "Compras",        icon: Truck },
  { href: "/financeiro",  label: "Financeiro",     icon: Wallet },
  { href: "/fiscal",      label: "Fiscal",         icon: FileText },
  { href: "/relatorios",  label: "Relatórios",     icon: BarChart3 },
  { href: "/admin",       label: "Administração",  icon: Settings },
  { href: "/portal",      label: "Portal do cliente", icon: Globe },
  { href: "/acesso",      label: "Acesso",         icon: KeyRound },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-background md:block">
      <div className="flex h-14 items-center border-b px-4 font-bold tracking-tight">
        AVANT CELL
      </div>
      <nav className="grid gap-0.5 p-2">
        {MODULES.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              pathname.startsWith(href)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
