"use client";

import { useActionState } from "react";
import { saveSupplier, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SupplierForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveSupplier, {});
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Novo fornecedor</CardTitle></CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <Input name="name" placeholder="Nome / razão social *" required />
          <Input name="cnpj" placeholder="CNPJ" />
          <Input name="phone" placeholder="Telefone / WhatsApp" />
          <Input name="email" placeholder="E-mail" />
          <Input name="seller" placeholder="Vendedor / contato" />
          <div className="flex gap-2">
            <Input name="payment_terms" placeholder="Cond. pagamento (ex.: 30/60)" />
            <Input name="lead_time_days" placeholder="Prazo (dias)" className="w-28" type="number" />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Cadastrar"}
            </Button>
            {state?.ok && <span className="text-sm text-green-600">Fornecedor cadastrado ✓</span>}
            {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
