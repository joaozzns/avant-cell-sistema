"use client";

import { useActionState } from "react";
import { saveFiscalSettings, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function FiscalSettingsForm({ settings, gateway }: {
  settings: Record<string, unknown> | null;
  gateway: { name?: string } | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveFiscalSettings, {});
  const s = (settings ?? {}) as Record<string, string | null>;
  const series = ((settings?.series ?? {}) as Record<string, string>);

  return (
    <form action={formAction} className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regime e ambiente</CardTitle>
          <CardDescription>Parâmetros que o contador define uma vez</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Regime tributário</Label>
            <select name="tax_regime" defaultValue={s.tax_regime ?? ""}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">—</option>
              <option value="simples">Simples Nacional</option>
              <option value="presumido">Lucro Presumido</option>
              <option value="real">Lucro Real</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Ambiente</Label>
            <select name="environment" defaultValue={s.environment ?? "homolog"}
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="homolog">Homologação (teste)</option>
              <option value="production">Produção</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label>CSOSN padrão</Label>
            <Input name="default_csosn" defaultValue={s.default_csosn ?? "102"} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-2">
              <Label>Série NFC-e</Label>
              <Input name="series_nfce" defaultValue={series.nfce ?? "1"} />
            </div>
            <div className="grid gap-2">
              <Label>Série NF-e</Label>
              <Input name="series_nfe" defaultValue={series.nfe ?? "1"} />
            </div>
            <div className="grid gap-2">
              <Label>Série NFS-e</Label>
              <Input name="series_nfse" defaultValue={series.nfse ?? "1"} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Alíquota ISS (%)</Label>
            <Input name="iss_rate" defaultValue={s.iss_rate ?? ""} inputMode="decimal" />
          </div>
          <div className="grid gap-2">
            <Label>Código de serviço municipal</Label>
            <Input name="service_code" defaultValue={s.service_code ?? ""} placeholder="ex.: 14.01" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gateway de emissão</CardTitle>
          <CardDescription>
            {gateway?.name
              ? `Conectado: ${gateway.name}. Sem gateway, as notas saem em modo simulado.`
              : "Sem gateway: as notas saem em modo simulado até você contratar um emissor (Focus NFe, Nuvem Fiscal, PlugNotas)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Provedor</Label>
            <select name="gateway_provider" defaultValue=""
              className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">Nenhum (modo simulado)</option>
              <option value="focusnfe">Focus NFe</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Token da API</Label>
            <Input name="gateway_token" type="password" placeholder="••••••••" autoComplete="off" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar configurações"}
        </Button>
        {state?.ok && <span className="text-sm text-green-600">Salvo ✓</span>}
        {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  );
}
