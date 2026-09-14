"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { aceitarConvite } from "./actions";

export function AceitarConvite({ token }: { token: string }) {
  const [estado, acao, pendente] = useActionState<{ erro?: string }, FormData>(aceitarConvite, {});
  return (
    <form action={acao} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Entrando…" : "Entrar na equipe"}
      </Button>
    </form>
  );
}
