"use client";

import { useActionState } from "react";
import { createAccount, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AccountForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAccount, {});
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Nova conta (banco / carteira)</CardTitle></CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <Input name="name" placeholder="Nome da conta (ex.: Nubank PJ)" className="w-56" required />
          <select name="type" className="h-9 rounded-md border bg-transparent px-3 text-sm">
            <option value="bank">Banco</option>
            <option value="wallet">Carteira digital</option>
            <option value="cash">Caixa físico</option>
          </select>
          <Input name="initial_balance" placeholder="Saldo inicial (R$)" inputMode="decimal" className="w-36" />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Criando…" : "Criar conta"}
          </Button>
          {state?.ok && <span className="text-sm text-green-600">Conta criada ✓</span>}
          {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
        </form>
      </CardContent>
    </Card>
  );
}
