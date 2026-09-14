"use client";

import { useActionState } from "react";
import { createCompany } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(createCompany, {});

  return (
    <div className="min-h-dvh grid place-items-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Configure sua empresa</CardTitle>
          <CardDescription>
            Isso cria sua empresa e a primeira loja. Você poderá adicionar
            outras unidades e usuários depois, em Administração.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="company_name">Nome da empresa</Label>
              <Input id="company_name" name="company_name" placeholder="Avant Cell" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store_name">Nome da primeira loja</Label>
              <Input id="store_name" name="store_name" placeholder="Loja principal" />
            </div>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar e começar"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Foi convidado por uma loja? Não crie uma empresa: abra o link do convite que você recebeu.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
