"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoSenha } from "@/components/campo-senha";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export function SignupForm({ convite }: { convite?: string }) {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(signup, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          {convite ? "Crie sua conta para entrar na equipe" : "Depois do cadastro você configura sua empresa e loja"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {convite && <input type="hidden" name="convite" value={convite} />}
          <div className="grid gap-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Senha</Label>
            <CampoSenha id="password" name="password" required minLength={8} autoComplete="new-password" />
            <p className="text-xs text-muted-foreground">
              Mínimo 8 caracteres, com letra e número
            </p>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Criando…" : "Criar conta"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href={convite ? `/login?convite=${convite}` : "/login"} className="underline underline-offset-4">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
