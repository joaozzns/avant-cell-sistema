"use client";

import { useActionState } from "react";
import { saveCustomer, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function CustomerForm({ customer }: { customer?: Record<string, unknown> | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCustomer,
    {}
  );
  const c = (customer ?? {}) as Record<string, string | boolean | null>;

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {c.id && <input type="hidden" name="id" value={String(c.id)} />}
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" name="name" defaultValue={String(c.name ?? "")} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kind">Tipo</Label>
            <select id="kind" name="kind" defaultValue={String(c.kind ?? "person")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="person">Pessoa física</option>
              <option value="company">Pessoa jurídica</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cpf_cnpj">CPF / CNPJ</Label>
            <Input id="cpf_cnpj" name="cpf_cnpj" defaultValue={String(c.cpf_cnpj ?? "")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" defaultValue={String(c.phone ?? "")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" name="whatsapp" defaultValue={String(c.whatsapp ?? "")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" defaultValue={String(c.email ?? "")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="birthdate">Nascimento</Label>
            <Input id="birthdate" name="birthdate" type="date" defaultValue={String(c.birthdate ?? "")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="origin">Origem</Label>
            <select id="origin" name="origin" defaultValue={String(c.origin ?? "")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">—</option>
              <option value="indicacao">Indicação</option>
              <option value="redes">Redes sociais</option>
              <option value="passagem">Passagem</option>
              <option value="campanha">Campanha</option>
            </select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" name="notes" defaultValue={String(c.notes ?? "")} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="consent_contact" defaultChecked={Boolean(c.consent_contact)} />
            Cliente autoriza contato por WhatsApp/e-mail (LGPD — registrado com data)
          </label>
          {state?.error && (
            <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Salvar cliente"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
