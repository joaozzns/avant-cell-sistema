"use client";

import { Menu, CircleHelp, LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/(auth)/actions";

export function Header({
  userName,
  storeName,
  companyName,
  onAlternarMenu,
}: {
  userName: string;
  storeName?: string;
  companyName?: string;
  onAlternarMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[70px] shrink-0 items-center gap-3 border-b bg-card px-4 md:px-6">
      <button
        type="button"
        onClick={onAlternarMenu}
        aria-label="Alternar menu lateral"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-2 md:gap-4">
        {(companyName || storeName) && (
          <div className="hidden items-center gap-2 rounded-lg border bg-background px-3 py-2 sm:flex">
            <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Empresa:</span>
            <span className="max-w-[220px] truncate text-sm font-medium">
              {companyName || storeName}
            </span>
          </div>
        )}

        <a
          href="https://avantcell.com.br/contato/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ajuda"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <CircleHelp className="h-5 w-5" />
        </a>

        <div className="hidden text-right leading-tight md:block">
          <p className="text-sm font-medium">{userName}</p>
          {storeName && (
            <p className="text-xs text-muted-foreground">{storeName}</p>
          )}
        </div>

        <form action={logout}>
          <Button variant="outline" size="sm" type="submit">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
