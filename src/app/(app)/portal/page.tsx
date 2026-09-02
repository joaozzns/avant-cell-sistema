import { getSessionContext } from "@/lib/context";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OS_STATUS } from "@/app/(app)/os/os-labels";
import { CopyLink } from "./copy-link";

export default async function PortalPage() {
  const { supabase, storeId } = await getSessionContext();
  const { data: orders } = await supabase
    .from("service_orders")
    .select("id, number, status, public_token, created_at, customers(name, whatsapp, phone)")
    .eq("store_id", storeId)
    .not("status", "in", "(canceled)")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portal do cliente</h1>
        <p className="text-sm text-muted-foreground">
          Cada OS tem um link público único — o cliente acompanha o status e
          aprova o orçamento sem ligar para a loja.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links de acompanhamento</CardTitle>
          <CardDescription>
            O link expira do radar do cliente após a retirada; nunca expõe custo
            nem comentários internos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {(orders ?? []).map((o) => {
            const c = o.customers as { name?: string; whatsapp?: string; phone?: string } | null;
            const phone = (c?.whatsapp ?? c?.phone ?? "").replace(/\D/g, "");
            return (
              <div key={o.id} className="flex flex-wrap items-center gap-2 rounded border px-3 py-2">
                <span className="font-medium">#{o.number}</span>
                <span>{c?.name}</span>
                <Badge variant="secondary">{OS_STATUS[o.status]?.label ?? o.status}</Badge>
                <span className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</span>
                <span className="ml-auto flex gap-2">
                  <CopyLink token={o.public_token} />
                  {phone && (
                    <a
                      href={`https://wa.me/55${phone}?text=${encodeURIComponent(`Acompanhe sua OS #${o.number}: `)}`}
                      target="_blank" rel="noreferrer"
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    >
                      WhatsApp
                    </a>
                  )}
                </span>
              </div>
            );
          })}
          {(orders ?? []).length === 0 && (
            <p className="text-muted-foreground">Nenhuma OS ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
