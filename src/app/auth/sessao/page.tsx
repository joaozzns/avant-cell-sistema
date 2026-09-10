"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* Recebe a sessao vinda da landing (avantcell.com.br/entrar/).
   Os tokens chegam no fragmento da URL — o navegador nao envia fragmento ao
   servidor, entao eles nao aparecem em log de acesso nem no Referer. Aqui o
   createBrowserClient grava os cookies no dominio do sistema e a navegacao
   segue para o painel. */
export default function ReceberSessao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");

    if (!access_token || !refresh_token) {
      setErro("Link de acesso inválido ou expirado.");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        /* limpa os tokens da barra de enderecos antes de seguir */
        window.history.replaceState(null, "", "/auth/sessao");
        if (error) {
          setErro("Não foi possível abrir a sessão. Entre novamente.");
          return;
        }
        router.replace("/dashboard");
      })
      .catch(() => setErro("Não foi possível abrir a sessão. Entre novamente."));
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center">
        {erro ? (
          <>
            <p className="text-sm font-medium text-destructive">{erro}</p>
            <a
              href="/login"
              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Ir para o login
            </a>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Abrindo o sistema...</p>
          </>
        )}
      </div>
    </div>
  );
}
