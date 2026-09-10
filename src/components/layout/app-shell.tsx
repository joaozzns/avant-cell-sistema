"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { Trilha } from "./trilha";
import { cn } from "@/lib/utils";

export function AppShell({
  nome,
  email,
  storeName,
  companyName,
  children,
}: {
  nome: string;
  email: string;
  storeName?: string;
  companyName?: string;
  children: React.ReactNode;
}) {
  /* no desktop a barra recolhe; no celular ela vira uma gaveta sobreposta */
  const [aberta, setAberta] = useState(true);
  const [gaveta, setGaveta] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      {/* desktop */}
      <div
        className={cn(
          "hidden shrink-0 overflow-hidden transition-[width] duration-200 md:block",
          aberta ? "w-[272px]" : "w-0"
        )}
      >
        <div className="sticky top-0 h-dvh">
          <Sidebar nome={nome} email={email} />
        </div>
      </div>

      {/* celular */}
      {gaveta && (
        <>
          <button
            aria-label="Fechar menu"
            onClick={() => setGaveta(false)}
            className="fixed inset-0 z-30 bg-black/45 md:hidden"
          />
          <div className="fixed inset-y-0 left-0 z-40 md:hidden">
            <Sidebar nome={nome} email={email} onNavegar={() => setGaveta(false)} />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          userName={nome}
          storeName={storeName}
          companyName={companyName}
          onAlternarMenu={() => {
            if (window.matchMedia("(min-width: 768px)").matches) setAberta((v) => !v);
            else setGaveta((v) => !v);
          }}
        />
        <main className="flex-1 p-4 md:p-6">
          <Trilha />
          {children}
        </main>
      </div>
    </div>
  );
}
