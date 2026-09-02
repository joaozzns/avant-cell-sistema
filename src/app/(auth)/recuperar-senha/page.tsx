"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export default function RecoverPage() {
  const [state, formAction, pending] = useActionState<{ done?: boolean }, FormData>(requestPasswordReset, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>
          Enviaremos um link de redefinição para o seu e-mail
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state?.done ? (
          <div className="grid gap-4">
            <p className="text-sm">
              Se o e-mail estiver cadastrado, você receberá o link em instantes.
              O link vale por 30 minutos.
            </p>
            <Link href="/login" className={buttonVariants({ variant: "outline" })}>
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form action={formAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
