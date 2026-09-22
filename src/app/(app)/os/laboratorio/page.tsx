import Link from "next/link";
import { getSessionContext } from "@/lib/context";
import { brl, fmtDate } from "@/lib/format";
import { ETAPAS_EXTERNO, ROTULO_EXTERNO, atrasado, diasCorridos } from "@/lib/externo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LinhaOs = { id: string; number: number; store_id: string; customers: { name?: string } | null; customer_devices: { model_text?: string } | null };

export default async function LaboratorioPage() {
  const { supabase, companyId } = await getSessionContext();

  const { data } = await supabase
    .from("os_external_services")
    .select(`
      id, partner_name, status, sent_at, promised_at, received_at, agreed_cost, actual_cost,
      tracking_code, divergence, payable_id,
      service_orders!inner(id, number, store_id, company_id,
        customers(name), customer_devices(model_text))
    `)
    .eq("service_orders.company_id", companyId)
    .order("sent_at", { ascending: false })
    .limit(200);

  const linhas = (data ?? []).map((e) => {
    const os = e.service_orders as unknown as LinhaOs;
    return {
      id: e.id as string,
      parceiro: e.partner_name as string,
      situacao: e.status as string,
      enviadoEm: e.sent_at as string,
      prazo: (e.promised_at as string | null) ?? null,
      recebidoEm: (e.received_at as string | null) ?? null,
      custo: Number((e.actual_cost ?? e.agreed_cost) ?? 0),
      rastreio: (e.tracking_code as string | null) ?? null,
      divergencia: (e.divergence as string | null) ?? null,
      osId: os?.id ?? "",
      numero: os?.number ?? 0,
      cliente: os?.customers?.name ?? "—",
      aparelho: os?.customer_devices?.model_text ?? "aparelho",
    };
  });

  const fora = linhas.filter((l) => l.situacao !== "received");
  const voltaram = linhas.filter((l) => l.situacao === "received").slice(0, 25);
  const emAtraso = fora.filter((l) => atrasado(l.prazo, l.situacao));
  const valorFora = fora.reduce((s, l) => s + l.custo, 0);

  const porEtapa = ETAPAS_EXTERNO
    .filter((e) => e.valor !== "received")
    .map((e) => ({ ...e, qtd: fora.filter((l) => l.situacao === e.valor).length }))
    .filter((e) => e.qtd > 0);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Laboratório externo</h1>
        <p className="text-sm text-muted-foreground">
          Todo aparelho que está fora da loja, com quem está, há quantos dias e quanto vai custar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Aparelhos fora", String(fora.length)],
          ["Passaram do prazo", String(emAtraso.length)],
          ["Custo combinado fora", brl(valorFora)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      {porEtapa.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porEtapa.map((e) => (
            <Badge key={e.valor} variant="secondary" title={e.ajuda}>{e.rotulo}: {e.qtd}</Badge>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Fora da loja ({fora.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-4 text-sm">
          {fora.length === 0 && (
            <p className="text-muted-foreground">Nenhum aparelho em laboratório externo agora.</p>
          )}
          {fora.map((l) => {
            const atrasadoAqui = atrasado(l.prazo, l.situacao);
            return (
              <div key={l.id} className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 ${atrasadoAqui ? "border-destructive/50" : ""}`}>
                <span className="min-w-0 flex-1">
                  <Link href={`/os/${l.osId}`} className="font-medium text-primary underline">
                    OS #{l.numero}
                  </Link>
                  <span className="ml-2">{l.cliente} · {l.aparelho}</span>
                  <span className="block text-xs text-muted-foreground">
                    {l.parceiro}
                    {l.prazo ? ` · previsão ${fmtDate(l.prazo)}` : " · sem prazo combinado"}
                    {l.rastreio && ` · rastreio ${l.rastreio}`}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{diasCorridos(l.enviadoEm)} dia(s) fora</span>
                {l.custo > 0 && <span className="text-xs">{brl(l.custo)}</span>}
                <Badge variant={atrasadoAqui ? "destructive" : "secondary"}>
                  {atrasadoAqui ? "atrasado" : ROTULO_EXTERNO[l.situacao] ?? l.situacao}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Já voltaram</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 pt-4 text-sm">
          {voltaram.length === 0 && <p className="text-muted-foreground">Nada recebido ainda.</p>}
          {voltaram.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
              <span className="min-w-0 flex-1">
                <Link href={`/os/${l.osId}`} className="text-primary underline">OS #{l.numero}</Link>
                <span className="ml-2">{l.parceiro}</span>
                {l.divergencia && (
                  <span className="block text-xs text-destructive">divergência: {l.divergencia}</span>
                )}
              </span>
              {l.recebidoEm && (
                <span className="text-xs text-muted-foreground">recebido {fmtDate(l.recebidoEm)}</span>
              )}
              {l.custo > 0 && <span className="text-xs">{brl(l.custo)}</span>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
